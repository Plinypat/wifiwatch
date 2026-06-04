#!/usr/bin/env python3
"""
RuView ESP32 Provisioning Tool

Writes WiFi credentials and server config into the ESP32's NVS flash partition.
Run this once per device before first use, or any time you change settings.

Usage:
    python3 firmware/tools/provision.py [options]

Examples:
    # Interactive mode (prompts for all values)
    python3 firmware/tools/provision.py

    # Full non-interactive
    python3 firmware/tools/provision.py \\
        --port  COM4 \\
        --ssid  "MyNetwork" \\
        --pass  "s3cr3t" \\
        --sink  87.99.158.55 \\
        --slot  0

Requirements:
    pip install esptool
"""

import argparse
import struct
import subprocess
import sys
import os
import tempfile

# NVS binary generation without external deps
# We write a minimal NVS partition image using esptool's nvs_partition_gen

NVS_PARTITION_SIZE = 0x6000   # must match partitions.csv


def prompt(label, default=None, password=False):
    suffix = f" [{default}]" if default is not None else ""
    if password:
        import getpass
        val = getpass.getpass(f"{label}{suffix}: ")
    else:
        val = input(f"{label}{suffix}: ").strip()
    if not val and default is not None:
        return str(default)
    return val


def build_nvs_csv(cfg: dict) -> str:
    """Build the CSV file consumed by nvs_partition_gen."""
    lines = [
        "key,type,encoding,value",
        "ruview,namespace,,",
        f"wifi_ssid,data,string,{cfg['ssid']}",
        f"wifi_pass,data,string,{cfg['password']}",
        f"sink_ip,data,string,{cfg['sink_ip']}",
        f"sink_port,data,u16,{cfg['sink_port']}",
        f"rf_channel,data,u8,{cfg['channel']}",
        f"mesh_slot,data,u8,{cfg['slot']}",
        f"mesh_total,data,u8,{cfg['total']}",
        f"rf_mac,data,string,{cfg.get('mac', '')}",
    ]
    return "\n".join(lines) + "\n"


def find_nvs_gen():
    """Locate nvs_partition_gen.py from IDF or esptool package."""
    candidates = []

    idf_path = os.environ.get("IDF_PATH")
    if idf_path:
        candidates.append(os.path.join(idf_path, "components", "nvs_flash",
                                       "nvs_partition_generator", "nvs_partition_gen.py"))

    # Common Windows IDF install locations
    for ver in ["v6.0.1", "v5.4.1", "v5.3.1", "v5.2.1"]:
        candidates.append(
            os.path.join("D:\\esp\\.espressif", ver, "esp-idf", "components",
                         "nvs_flash", "nvs_partition_generator", "nvs_partition_gen.py"))

    try:
        import esptool
        base = os.path.dirname(esptool.__file__)
        candidates.append(os.path.join(base, "nvs_partition_gen.py"))
    except ImportError:
        pass

    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def main():
    parser = argparse.ArgumentParser(description="RuView ESP32 provisioning tool")
    parser.add_argument("--port",   help="Serial port (e.g. COM4 or /dev/ttyUSB0)")
    parser.add_argument("--ssid",   help="WiFi SSID")
    parser.add_argument("--pass",   dest="password", help="WiFi password")
    parser.add_argument("--sink",   default="87.99.158.55", help="Sensing server IP")
    parser.add_argument("--sink-port", type=int, default=3000, help="Sensing server port")
    parser.add_argument("--channel", type=int, default=6, help="802.11 channel (1-13)")
    parser.add_argument("--slot",   type=int, default=0, help="Mesh slot (0-7)")
    parser.add_argument("--total",  type=int, default=1, help="Total mesh nodes")
    parser.add_argument("--mac",    default="", help="BSSID filter (optional)")
    parser.add_argument("--baud",   type=int, default=921600)
    parser.add_argument("--dry-run", action="store_true", help="Generate NVS image but don't flash")
    args = parser.parse_args()

    print("=" * 50)
    print("  RuView ESP32 Provisioning Tool")
    print("=" * 50)

    # Collect config interactively for any missing values
    port     = args.port     or prompt("Serial port (e.g. COM4 or /dev/ttyUSB0)")
    ssid     = args.ssid     or prompt("WiFi SSID")
    password = args.password or prompt("WiFi password", password=True)
    sink_ip  = args.sink

    cfg = {
        "ssid":      ssid,
        "password":  password,
        "sink_ip":   sink_ip,
        "sink_port": args.sink_port,
        "channel":   args.channel,
        "slot":      args.slot,
        "total":     args.total,
        "mac":       args.mac,
    }

    print(f"\nConfig to flash:")
    print(f"  SSID        : {cfg['ssid']}")
    print(f"  Server      : {cfg['sink_ip']}:{cfg['sink_port']}")
    print(f"  Channel     : {cfg['channel']}")
    print(f"  Mesh slot   : {cfg['slot']}/{cfg['total']}")
    print(f"  Port        : {port}")

    # Generate NVS CSV
    csv_content = build_nvs_csv(cfg)

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "nvs.csv")
        bin_path = os.path.join(tmpdir, "nvs.bin")

        with open(csv_path, "w") as f:
            f.write(csv_content)

        # Generate NVS binary
        nvs_gen = find_nvs_gen()
        if nvs_gen:
            cmd = [sys.executable, nvs_gen, "generate",
                   csv_path, bin_path, str(NVS_PARTITION_SIZE)]
        else:
            # Fall back to esptool's built-in nvs_partition_gen
            cmd = ["python3", "-m", "esptool.nvs_partition_gen", "generate",
                   csv_path, bin_path, str(NVS_PARTITION_SIZE)]

        print(f"\nGenerating NVS image...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            # Try nvs_partition_gen as an installed script via sys.executable
            cmd2 = [sys.executable, "-m", "nvs_partition_gen", "generate",
                    csv_path, bin_path, str(NVS_PARTITION_SIZE)]
            result = subprocess.run(cmd2, capture_output=True, text=True)
        if result.returncode != 0:
            print("ERROR: Could not generate NVS image.")
            print("Make sure IDF_PATH is set or run: pip install esptool")
            print(result.stderr)
            sys.exit(1)

        print(f"  NVS image generated ({NVS_PARTITION_SIZE} bytes)")

        if args.dry_run:
            import shutil
            out = "nvs_provision.bin"
            shutil.copy(bin_path, out)
            print(f"  Dry run — image saved to {out}")
            return

        # Flash NVS partition at offset 0x9000 (matches partitions.csv)
        print(f"\nFlashing NVS to {port}...")
        flash_cmd = [
            "esptool.py",
            "--chip", "auto",
            "--port", port,
            "--baud", str(args.baud),
            "write_flash",
            "0x9000", bin_path,
        ]
        result = subprocess.run(flash_cmd)
        if result.returncode != 0:
            print("\nERROR: Flash failed. Check port and try again.")
            sys.exit(1)

        print("\n✓ Provisioning complete! Reboot the ESP32.")
        print(f"  It will connect to '{ssid}' and stream to {sink_ip}:{args.sink_port}")


if __name__ == "__main__":
    main()

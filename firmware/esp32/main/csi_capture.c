#include "csi_capture.h"
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_timer.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static const char *TAG = "csi_capture";

// Max JSON frame size: slot(1) + channel(2) + rssi(4) + 128 CSI pairs * ~6 chars + overhead
#define JSON_BUF_SIZE 4096

static csi_frame_cb_t  s_on_frame  = NULL;
static uint8_t         s_slot      = 0;
static char           *s_json_buf  = NULL;

// CSI configuration — capture from all received frames
static const wifi_csi_config_t s_csi_cfg = {
    .lltf_en           = true,
    .htltf_en          = true,
    .stbc_htltf2_en    = true,
    .ltf_merge_en      = true,
    .channel_filter_en = false,
    .manu_scale        = false,
    .shift             = 0,
};

static void csi_callback(void *ctx, wifi_csi_info_t *info) {
    if (!s_on_frame || !info || !info->buf || info->len == 0) return;

    // Timestamp in seconds (float)
    double ts = (double)esp_timer_get_time() / 1e6;

    // Start JSON — fixed fields
    int pos = snprintf(s_json_buf, JSON_BUF_SIZE,
        "{\"ts\":%.3f,\"slot\":%u,\"channel\":%u,\"rssi\":%d,\"noise_floor\":%d,\"csi\":[",
        ts,
        (unsigned)s_slot,
        (unsigned)info->rx_ctrl.channel,
        (int)info->rx_ctrl.rssi,
        (int)info->rx_ctrl.noise_floor
    );

    // Append CSI buffer as int8 array (interleaved re, im pairs)
    // info->buf is int8_t[], length info->len
    const int8_t *buf = (const int8_t *)info->buf;
    for (int i = 0; i < info->len && pos < JSON_BUF_SIZE - 16; i++) {
        pos += snprintf(s_json_buf + pos, JSON_BUF_SIZE - pos,
                        "%d%s", (int)buf[i], (i < info->len - 1) ? "," : "");
    }

    // Close JSON
    if (pos < JSON_BUF_SIZE - 4) {
        pos += snprintf(s_json_buf + pos, JSON_BUF_SIZE - pos, "]}");
    }

    s_on_frame(s_json_buf, (size_t)pos);
}

void csi_capture_init(uint8_t channel, uint8_t slot, csi_frame_cb_t on_frame) {
    s_on_frame = on_frame;
    s_slot = slot;

    s_json_buf = malloc(JSON_BUF_SIZE);
    if (!s_json_buf) {
        ESP_LOGE(TAG, "Failed to allocate JSON buffer");
        return;
    }

    esp_wifi_set_csi_config(&s_csi_cfg);
    esp_wifi_set_csi_rx_cb(csi_callback, NULL);
    esp_wifi_set_csi(true);

    ESP_LOGI(TAG, "CSI capture started on channel %d", channel);
}

void csi_capture_deinit(void) {
    esp_wifi_set_csi(false);
    esp_wifi_set_csi_rx_cb(NULL, NULL);
    if (s_json_buf) { free(s_json_buf); s_json_buf = NULL; }
}

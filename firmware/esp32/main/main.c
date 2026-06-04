/**
 * RuView ESP32 Firmware
 *
 * Boot sequence:
 *  1. Init NVS — load provisioning config (WiFi creds, server IP, channel, mesh slot)
 *  2. Connect to WiFi STA
 *  3. Start WebSocket client → ws://<server_ip>:<port>/ws/esp32
 *  4. Start CSI capture — callback serialises frames to JSON and sends over WS
 *
 * Provisioning:
 *  Run  python3 tools/provision.py  from the repo root to write config to NVS.
 */

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"

#include "nvs_config.h"
#include "csi_capture.h"
#include "ws_client.h"

static const char *TAG = "ruview";

// WiFi event group bits
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1
#define WIFI_MAX_RETRY     10

static EventGroupHandle_t s_wifi_event_group;
static int                s_retry_count = 0;
static ruview_config_t    s_cfg;

// ---- WiFi ----

static void wifi_event_handler(void *arg, esp_event_base_t base,
                                int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_count < WIFI_MAX_RETRY) {
            esp_wifi_connect();
            s_retry_count++;
            ESP_LOGW(TAG, "WiFi retry %d/%d", s_retry_count, WIFI_MAX_RETRY);
        } else {
            xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
            ESP_LOGE(TAG, "WiFi failed after %d retries", WIFI_MAX_RETRY);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)data;
        ESP_LOGI(TAG, "WiFi connected  ip=" IPSTR, IP2STR(&event->ip_info.ip));
        s_retry_count = 0;
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static bool wifi_connect(const ruview_config_t *cfg) {
    s_wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t init_cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init_cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    wifi_config_t wifi_cfg = {};
    strncpy((char *)wifi_cfg.sta.ssid,     cfg->ssid,     sizeof(wifi_cfg.sta.ssid) - 1);
    strncpy((char *)wifi_cfg.sta.password, cfg->password, sizeof(wifi_cfg.sta.password) - 1);
    wifi_cfg.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));

    // Lock to the provisioned channel if specified
    if (cfg->channel > 0) {
        esp_wifi_set_channel(cfg->channel, WIFI_SECOND_CHAN_NONE);
    }

    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "WiFi STA started, connecting to \"%s\"...", cfg->ssid);

    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE,
                                           pdMS_TO_TICKS(30000));

    return (bits & WIFI_CONNECTED_BIT) != 0;
}

// ---- CSI callback → WebSocket ----

static void on_csi_frame(const char *json, size_t len) {
    ws_client_send(json, len);
}

// ---- Main ----

void app_main(void) {
    ESP_LOGI(TAG, "RuView firmware booting...");

    // Init NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS partition wiped, re-initialising");
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Load config
    nvs_config_load(&s_cfg);

    if (strlen(s_cfg.ssid) == 0) {
        ESP_LOGE(TAG, "No WiFi credentials in NVS — run provision.py first");
        ESP_LOGI(TAG, "Halting. Flash with provisioning config then reboot.");
        return;
    }

    // Connect to WiFi
    if (!wifi_connect(&s_cfg)) {
        ESP_LOGE(TAG, "WiFi connection failed — check SSID/password");
        return;
    }

    // Start WebSocket client
    ws_client_start(s_cfg.server_ip, s_cfg.server_port);
    ESP_LOGI(TAG, "WS client started  target=ws://%s:%d/ws/esp32  slot=%d/%d",
             s_cfg.server_ip, s_cfg.server_port,
             s_cfg.mesh_slot, s_cfg.mesh_total);

    // Wait for WS to connect before starting CSI
    int wait = 0;
    while (!ws_client_is_connected() && wait++ < 50) {
        vTaskDelay(pdMS_TO_TICKS(200));
    }
    if (!ws_client_is_connected()) {
        ESP_LOGW(TAG, "WS not connected after 10s, starting CSI anyway");
    }

    // Start CSI capture — frames stream to on_csi_frame → ws_client_send
    csi_capture_init(s_cfg.channel, s_cfg.mesh_slot, on_csi_frame);
    ESP_LOGI(TAG, "CSI streaming   ch=%d  slot=%d/%d",
             s_cfg.channel, s_cfg.mesh_slot, s_cfg.mesh_total);

    // Main loop — watchdog / reconnect handling
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(5000));
        ESP_LOGI(TAG, "Heartbeat  ws=%s  ch=%d",
                 ws_client_is_connected() ? "UP" : "DOWN",
                 s_cfg.channel);
    }
}

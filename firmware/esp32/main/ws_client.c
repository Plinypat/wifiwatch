#include "ws_client.h"
#include "esp_websocket_client.h"
#include "esp_log.h"
#include "esp_timer.h"
#include <stdio.h>
#include <string.h>

static const char *TAG = "ws_client";

static esp_websocket_client_handle_t s_client = NULL;
static volatile int s_connected = 0;

// Reconnect backoff state
static int s_reconnect_ms = 2000;

static void ws_event_handler(void *arg,
                              esp_event_base_t base,
                              int32_t event_id,
                              void *event_data)
{
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;

    switch (event_id) {
    case WEBSOCKET_EVENT_CONNECTED:
        ESP_LOGI(TAG, "WS connected");
        s_connected = 1;
        s_reconnect_ms = 2000;
        break;

    case WEBSOCKET_EVENT_DISCONNECTED:
        ESP_LOGW(TAG, "WS disconnected, will reconnect in %d ms", s_reconnect_ms);
        s_connected = 0;
        break;

    case WEBSOCKET_EVENT_ERROR:
        ESP_LOGE(TAG, "WS error");
        s_connected = 0;
        break;

    default:
        break;
    }
}

void ws_client_start(const char *server_ip, uint16_t port) {
    char uri[128];
    snprintf(uri, sizeof(uri), "ws://%s:%u/ws/esp32", server_ip, (unsigned)port);
    ESP_LOGI(TAG, "Connecting to %s", uri);

    esp_websocket_client_config_t cfg = {
        .uri                  = uri,
        .reconnect_timeout_ms = 5000,
        .network_timeout_ms   = 10000,
        .buffer_size          = 4096,
    };

    s_client = esp_websocket_client_init(&cfg);
    esp_websocket_register_events(s_client, WEBSOCKET_EVENT_ANY,
                                  ws_event_handler, NULL);
    esp_websocket_client_start(s_client);
}

void ws_client_send(const char *data, size_t len) {
    if (!s_connected || !s_client) return;
    int ret = esp_websocket_client_send_text(s_client, data, (int)len, pdMS_TO_TICKS(200));
    if (ret < 0) {
        ESP_LOGW(TAG, "Send failed");
    }
}

int ws_client_is_connected(void) {
    return s_connected;
}

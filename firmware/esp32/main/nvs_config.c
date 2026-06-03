#include "nvs_config.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "nvs_config";
#define NVS_NAMESPACE "ruview"

void nvs_config_defaults(ruview_config_t *cfg) {
    memset(cfg, 0, sizeof(*cfg));
    cfg->server_port = 3000;
    cfg->channel     = 6;
    cfg->mesh_slot   = 0;
    cfg->mesh_total  = 1;
    strncpy(cfg->server_ip, "87.99.158.55", sizeof(cfg->server_ip) - 1);
}

esp_err_t nvs_config_load(ruview_config_t *cfg) {
    nvs_config_defaults(cfg);

    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &h);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "NVS namespace not found, using defaults");
        return err;
    }

    size_t len;

    len = sizeof(cfg->ssid);
    nvs_get_str(h, "wifi_ssid", cfg->ssid, &len);

    len = sizeof(cfg->password);
    nvs_get_str(h, "wifi_pass", cfg->password, &len);

    len = sizeof(cfg->server_ip);
    nvs_get_str(h, "sink_ip", cfg->server_ip, &len);

    nvs_get_u16(h, "sink_port",   &cfg->server_port);
    nvs_get_u8 (h, "rf_channel",  &cfg->channel);
    nvs_get_u8 (h, "mesh_slot",   &cfg->mesh_slot);
    nvs_get_u8 (h, "mesh_total",  &cfg->mesh_total);

    len = sizeof(cfg->bssid);
    nvs_get_str(h, "rf_mac", cfg->bssid, &len);

    nvs_close(h);
    ESP_LOGI(TAG, "Loaded: ssid=%s sink=%s:%d ch=%d slot=%d/%d",
             cfg->ssid, cfg->server_ip, cfg->server_port,
             cfg->channel, cfg->mesh_slot, cfg->mesh_total);
    return ESP_OK;
}

esp_err_t nvs_config_save(const ruview_config_t *cfg) {
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;

    nvs_set_str(h, "wifi_ssid",  cfg->ssid);
    nvs_set_str(h, "wifi_pass",  cfg->password);
    nvs_set_str(h, "sink_ip",    cfg->server_ip);
    nvs_set_u16(h, "sink_port",  cfg->server_port);
    nvs_set_u8 (h, "rf_channel", cfg->channel);
    nvs_set_u8 (h, "mesh_slot",  cfg->mesh_slot);
    nvs_set_u8 (h, "mesh_total", cfg->mesh_total);
    nvs_set_str(h, "rf_mac",     cfg->bssid);

    err = nvs_commit(h);
    nvs_close(h);
    ESP_LOGI(TAG, "Config saved");
    return err;
}

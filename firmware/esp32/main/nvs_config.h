#pragma once
#include <stdint.h>
#include "esp_err.h"

typedef struct {
    char     ssid[64];
    char     password[64];
    char     server_ip[64];   // e.g. "87.99.158.55"
    uint16_t server_port;     // e.g. 3000
    uint8_t  channel;         // 802.11 channel 1-13
    char     bssid[18];       // optional MAC filter, "" to disable
    uint8_t  mesh_slot;       // 0-7, 0 = sync master
    uint8_t  mesh_total;      // total nodes in mesh
} ruview_config_t;

esp_err_t nvs_config_load(ruview_config_t *cfg);
esp_err_t nvs_config_save(const ruview_config_t *cfg);
void      nvs_config_defaults(ruview_config_t *cfg);

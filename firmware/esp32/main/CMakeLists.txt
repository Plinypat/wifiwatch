idf_component_register(
    SRCS
        "main.c"
        "nvs_config.c"
        "csi_capture.c"
        "ws_client.c"
    INCLUDE_DIRS "."
    REQUIRES
        nvs_flash
        esp_wifi
        esp_event
        esp_netif
)

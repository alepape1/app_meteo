import os


def post_fork(server, worker):
    """Start the MQTT subscriber in each worker after forking."""
    if os.getenv("MQTT_AUTOSTART", "1") != "1":
        return
    import mqtt_client
    mqtt_client.start()

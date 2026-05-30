[![Docker](https://github.com/mziech/frigate-onvif-trigger/actions/workflows/docker.yml/badge.svg)](https://github.com/mziech/frigate-onvif-trigger/actions/workflows/docker.yml)

# frigate-onvif-trigger

This allows to consume events from ONVIF-compatible cameras and post them as events to the [Frigate](https://frigate.video/) API.
Events will have proper start and end timestamps.
However, there will usually be no pre- and post-recording of an event.

This application has only been tested with Reolink cameras.
Other cameras might require adjustments in the event mapping.

This is essentially a workaround for [Frigate's lack of support for ONVIF events](https://github.com/blakeblackshear/frigate/issues/3485).
Most of the powerful features will not be working, you can only use the Frigate UI to manage your cameras and recordings.
**Only use this if you are running Frigate on old hardware which is not capable of GPU acceleration.**

## Usage

Use it with Docker:
```shell
docker run -e FRIGATE_URL=http://frigate:5000 ghcr.io/mziech/frigate-onvif-trigger
```

The application will automatically parse the onvif configuration from `frigate.yml`, which can be retrieved from the Frigate API or provided using a volume.

The following environment variables can be used to configure the application, only `FRIGATE_URL` is mandatory:
| Name | Description |
|------|-------------|
| `FRIGATE_URL` | URL to the Frigate instance, e.g. http://frigate:5000 |
| `FRIGATE_CONFIG` | Name of `frigate.yml` if it should be parsed from filesystem |
| `TOPIC_CATEGORY_EXCLUDES` | Comma separated list of [Frigate event labels](#labels) not to forward for, e.g. `motion` |
| `EVENT_LOG` | Full path to an event log file which should contain all raw ONVIF events for debugging purposes. It will automatically be rotated and deleted after 14 days. |
| `MQTT_PASSWORD` | MQTT broker password |
| `MQTT_USERNAME` | MQTT broker username |
| `MQTT_URI` | MQTT broker URL, e.g. `mqtt://broker` |
| `MQTT_TOPIC` | MQTT topic to post events to e.g. `frigate-onvif-trigger/events` |

## Labels

The following labels are used:
- motion
- person
- vehicle
- animal

## Event Mapping

Frigate and camera manufacturers will have a different way of categorizing events and naming these categories.

E.g. in case of Reolink, there is an ONVIF event `RuleEngine/MyRuleDetector/DogCatDetect`.
In Frigate an event can have the label `animal` and either the sub-label `cat` or `dog`.
The ONVIF event, does not contain information which kind of animal was spotted, so we go for `dog` to at least show a meaningful icon in Frigate.

If your camera produces other kinds of event, you need to add a mapping to `TOPIC_PRESETS` in [camera.ts](src/camera.ts).

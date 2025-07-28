#!/bin/bash

CLUSTER_NAME="${GKE_CLUSTER}"
ZONE="${GKE_ZONE}"

echo "Setting maintenance window for cluster: ${CLUSTER_NAME}"

gcloud container clusters update ${CLUSTER_NAME} \
  --zone=${ZONE} \
  --maintenance-window-start=2024-01-07T03:00:00Z \
  --maintenance-window-duration=4h \
  --maintenance-window-recurrence='FREQ=WEEKLY;BYDAY=SU'

echo "Maintenance window set successfully"
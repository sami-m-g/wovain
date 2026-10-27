#!/bin/sh
# repair-run-template.sh SERVICE...
# A failed `gcloud run deploy` still writes its image into the service's
# template. When that image was never pushed (a superseded pipeline's), every
# later `pulumi up` fails: --refresh reads the missing image back (Pulumi
# ignores images, CI owns them) and the update can't make a revision from it,
# so infra:production, and every deploy after it, is stuck. For each SERVICE
# whose template image is missing from Artifact Registry, this points the
# template back at the image of the latest ready revision without moving
# traffic. A service that doesn't exist, or a template whose
# image exists, is left alone. Needs gcloud, logged in, and GCP_REGION.
status=0
for service in "$@"; do
  image=$(gcloud run services describe "$service" --region "$GCP_REGION" --format='value(spec.template.spec.containers[0].image)' 2>/dev/null) || {
    echo "$service: no such service; nothing to repair."
    continue
  }
  if out=$(gcloud artifacts docker images describe "$image" 2>&1); then
    echo "$service: template image $image exists."
    continue
  fi
  if ! printf '%s' "$out" | grep -qi 'not found\|NOT_FOUND'; then
    echo "$service: could not check $image, leaving it: $out"
    status=1
    continue
  fi
  ready=$(gcloud run services describe "$service" --region "$GCP_REGION" --format='value(status.latestReadyRevisionName)')
  ready_image=$(gcloud run revisions describe "$ready" --region "$GCP_REGION" --format='value(spec.containers[0].image)')
  if [ -z "$ready_image" ] || ! gcloud artifacts docker images describe "$ready_image" >/dev/null 2>&1; then
    echo "$service: template image $image is missing, and so is the latest ready revision $ready's ($ready_image)."
    status=1
    continue
  fi
  # --no-traffic would pin a service that routes to LATEST (wovain-web-dev)
  # to fixed revisions, and later deploys there would get none; such a
  # service keeps LATEST, which then serves the same image as before.
  # wovain-web's traffic is pinned by CI, so it gets --no-traffic.
  traffic=--no-traffic
  if gcloud run services describe "$service" --region "$GCP_REGION" --format='value(spec.traffic[].latestRevision)' | grep -qi true; then
    traffic=
  fi
  echo "$service: template image $image is missing; repairing it to $ready_image (latest ready revision $ready) ${traffic:-keeping LATEST routing}."
  gcloud run services update "$service" --region "$GCP_REGION" --image "$ready_image" $traffic --quiet || status=1
done
exit $status

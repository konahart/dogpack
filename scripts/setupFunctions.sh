#!/bin/sh

gcloud beta functions deploy $HOOKNAME --stage-bucket gs://$BUCKET/ --trigger-http --entry-point=dmHook &
gcloud beta functions deploy postEvent --stage-bucket gs://$BUCKET/ --trigger-topic=postEvent &
gcloud beta functions deploy postRSVPs --stage-bucket gs://$BUCKET/ --trigger-topic=postRSVPs &

wait $(jobs -p)
echo "done! :)"

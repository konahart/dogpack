![another Google-owned dog pack](https://media.giphy.com/media/LIeTjBAxz1npe/giphy-tumblr.gif)

# Dogpack

Dogpack is a Twitter bot which automates announcing and confirming meetups of [DogpatchJS](http://dogpatchjs.com/). It will:

 * Tweet announcing DogpatchJS the morning of the meetup
 * Accept RSVPs in the form of DMs containing emoji
 * Tweet a confirmation or cancellation of the event depending on how many RSVPs are received
 
## Setup

Dogpack is hosted on [Google Cloud Functions](https://cloud.google.com/functions/). To set up your own Dogpack:

1. Create a [new project on the Google Cloud Console](https://console.cloud.google.com/projectcreate).
1. Create a [new Twitter app key](https://apps.twitter.com/app/new).
   * Set "Callback URL" to http://localhost:3000.
1. Copy `config.json.sample` to `config.json`, and fill in:
   * `project_id`: Your Google Cloud project id
   * `consumer_key`: Your Twitter app "Consumer Key"
   * `consumer_secret`: Your Twitter app "Consumer Secret"
    
1. Authenticate with Twitter:
   1. Run `./scripts/setupTwitter.js` and open http://localhost:3000 in a web browser.
   1. Click the link and authorize your Twitter app.
   1. When authentication is complete, http://localhost:3000 will contain a "Success!" message.
      * From the "Updated config" section, copy the values of `access_token_key`, `access_token_secret`, and `twitter_id` into your `config.json`.
      * Below the "Updated config," note the value of "Suggested webhook name" for the following step.
      
      The webhook name should be a long random string (which is difficult to guess). We rely on obscurity to prevent unauthorized calls to the webhook endpoint because of [a shortcoming in GCF which prevents checking request signatures](https://issuetracker.google.com/issues/36252545).

1. Deploy on GCF:
   1. [Create a Google Cloud Storage bucket](https://console.cloud.google.com/storage/create-bucket) for staging your functions.
   1. Run `BUCKET=your-storage-bucket-name HOOKNAME=your-webhook-name ./scripts/setupFunctions.sh`
   1. Note the HTTPs trigger endpoint URL for your webhook in the output. It might be of the form: `https://region-projectname.cloudfunctions.net/your-webhook-name`. Use this in the following step.

1. Set up Twitter's DM Webhook: run `./scripts/setupWebhook.js your-webhook-https-url`

   You should now have a functioning bot! Test it out by triggering the "postEvent" and "postRSVPs" functions in the Cloud Functions console, or by sending it a Twitter DM.
   
1. Set up scheduled posting:
   1. Customize `cron.yaml.sample` to suit your meetup schedule.
   1. Clone this [Google example repo](https://github.com/firebase/functions-cron) and follow the deployment instructions, adding your `cron.yaml`.
       
       Refer to [this PR](https://github.com/firebase/functions-cron/pull/5) (if it hasn't been merged yet) for securing your App Engine deployment.

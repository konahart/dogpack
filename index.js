const crypto = require('crypto')
const moment = require('moment-timezone')
const Twitter = require('twitter')
const Datastore = require('@google-cloud/datastore')
const emojiRegex = require('emoji-regex')()
const sample = require('lodash.sample')

const config = require('./config.json')

function randomize(template) {
  // Randomize a template consisting of segments to concatenate and randomize
  // at alternating depths. For reference:
  // ["concatenate", ["random", ["concatenate"]], "concatenate"]
  function visit(node, pick) {
    if (typeof node === 'string') {
      return node
    }

    // Recurse, alternating the value of pick
    const results = node.map(x => visit(x, !pick))

    // If pick is true, take a random element, otherwise join the strings
    return pick ? sample(results) : results.join('')
  }

  return visit(template, false)
}

function today() {
  return moment().tz(config.tz).format('YYYY-MM-DD')
}

exports.postEvent = function(ev, callback) {
  const client = new Twitter(config)
  const datastore = Datastore({
    projectId: config.project_id,
  })

  client.post('statuses/update', {
    status: randomize(config.event_msg) + `\nhttps://twitter.com/messages/compose?recipient_id=${config.twitter_id}`,
  })
    .then(resp => {
      console.log('tweeted', resp)
      const dayEntity = {
        key: datastore.key([
          'Day',
          today(),
        ]),
        data: {
          eventStatusID: resp.id_str,
        },
      }
      return datastore.upsert(dayEntity)
    })
    .then(() => callback())
    .catch(err => {
      console.error('error:', err)
      callback(err)
    })
}

exports.postRSVPs = function(ev, callback) {
  const client = new Twitter(config)
  const datastore = Datastore({
    projectId: config.project_id,
  })

  const day = today()
  const dayKey = datastore.key([
    'Day',
    day,
  ])

  const query = datastore.createQuery('RSVP')
    .hasAncestor(dayKey)

  Promise.all([
    datastore.get(dayKey),
    datastore.runQuery(query),
  ])
    .then(([[dayEntity], [rsvps]]) => {
      const emojis = rsvps.map(rsvp => rsvp.emoji)
      console.log('RSVP emojis for', day, ':', emojis)

      if (emojis.length < config.min_rsvp) {
        return client.post('statuses/update', {
          status: randomize(config.cancel_msg),
          in_reply_to_status_id: dayEntity.eventStatusID,
        })
      }

      const confirmMsg = randomize(config.confirm_msg)
      const confirmMsgLength = [...confirmMsg].length
      const emojiSpaces = 140 - confirmMsgLength - '[+999]'.length
      const displayedEmoji = emojis.slice(0, emojiSpaces).join('')
      const notDisplayedEmojiCount = Math.min(999, emojis.length - emojiSpaces)
      const notDisplayedEmojiMsg = notDisplayedEmojiCount > 0 ? `[+${notDisplayedEmojiCount}]` : ''

      return client.post('statuses/update', {
        status: confirmMsg + displayedEmoji + notDisplayedEmojiMsg,
        in_reply_to_status_id: dayEntity.eventStatusID,
      })
    })
    .then(() => callback())
    .catch(err => {
      console.error('error:', err)
      callback(err)
    })
}

exports.dmHook = function(req, res) {
  if (req.query.crc_token) {
    const response_token = 'sha256=' + crypto
      .createHmac('sha256', config.consumer_secret)
      .update(req.query.crc_token, 'utf8')
      .digest('base64')
    console.log('crc check from twitter:', req.query.crc_token, 'response:', response_token)
    res.status(200).json({response_token})
  } else {
    console.log('incoming webhook', req.body)

    /* :(

    https://issuetracker.google.com/issues/36252545

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', config.consumer_secret)
      .update(JSON.stringify(req.body), 'utf8')  // need to re-stringify because no access to raw data
      .digest('base64')
    if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(req.get('x-twitter-webhooks-signature')))) {
      console.warn('invalid webhook signature:', req.get('x-twitter-webhooks-signature'), 'expected:', expectedSignature)
      return res.status(400).send('invalid webhook signature')
    }

    */

    const client = new Twitter(config)
    const datastore = Datastore({
      projectId: config.project_id,
    })

    const promises = req.body.direct_message_events.map(dmEvent => {
      if (dmEvent.type !== 'message_create' || dmEvent.message_create.sender_id === config.twitter_id) {
        return
      }

      const ts = moment(Number(dmEvent.created_timestamp)).tz(config.tz)
      const messageText = dmEvent.message_create.message_data.text
      const senderID = dmEvent.message_create.sender_id

      console.log('received:', messageText)

      if (messageText === 'nvm') {
        console.log('nvm received. sending ok nvm response')
        const senderKey = datastore.key(['Day', ts.format('YYYY-MM-DD'), 'RSVP', senderID])
        return datastore.delete(senderKey)
          .then(() =>  client.post('direct_messages/new', {
            user_id: senderID,
            text: randomize(config.ok_nvm_dm_msg),
          }))
      }

      const emojiMatch = messageText.match(emojiRegex)
      const emoji = emojiMatch ? emojiMatch[0] : null

      if (!emoji) {
        console.log('no emoji found. sending huh response')
        return client.post('direct_messages/new', {
          user_id: senderID,
          text: randomize(config.huh_dm_msg),
        })
      }

      console.log('emoji found. sending ok response')
      const rsvpEntity = {
        key: datastore.key(['Day', ts.format('YYYY-MM-DD'), 'RSVP', senderID]),
        data: {
          name: req.body.users[senderID].screen_name,
          ts: ts.toDate(),
          emoji,
        },
      }
      return datastore.upsert(rsvpEntity)
        .then(() => client.post('direct_messages/new', {
          user_id: senderID,
          text: randomize(config.ok_dm_msg),
        }))
    })

    Promise.all(promises)
      .then(() => {
        res.status(200).send('ok')
      })
      .catch(err => {
        console.error('error:', err)
        res.status(500).send('internal error')
      })
  }
}

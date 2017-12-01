#!/usr/bin/env node
const crypto = require('crypto')
const http = require('http')
const OAuth = require('oauth').OAuth
const url = require('url')

const callbackURL = 'http://localhost:3000/callback'

const config = require('../config.json')

const oa = new OAuth(
  'https://api.twitter.com/oauth/request_token',
  'https://api.twitter.com/oauth/access_token',
  config.consumer_key,
  config.consumer_secret,
  '1.0',
  callbackURL,
  'HMAC-SHA1'
)

// based on https://github.com/ciaranj/node-oauth/blob/a7f8a1e21c362eb4ed2039431fb9ac2ae749f26a/examples/twitter-example.js
http.createServer(function(req, res) {
  oa.getOAuthRequestToken(function(error, oAuthToken, oAuthTokenSecret, results) {
    const urlObj = url.parse(req.url, true)
    const authURL = 'https://twitter.com/oauth/authenticate?oauth_token=' + oAuthToken
    const handlers = {
      '/': function(req, res) {
        const body = `<a href="${authURL}">Authorize with Twitter</a>`
        res.writeHead(200, {
          'Content-Length': Buffer.byteLength(body, 'utf8'),
          'Content-Type': 'text/html',
        })
        res.end(body)
      },

      '/callback': function(req, res) {
        const getOAuthRequestTokenCallback = function(error, oAuthAccessToken, oAuthAccessTokenSecret, results) {
          if (error) {
            console.log(error)
            res.writeHead(500)
            return res.end('error')
          }

          oa.get('https://api.twitter.com/1.1/account/verify_credentials.json', oAuthAccessToken, oAuthAccessTokenSecret, function(error, twitterResponse, result) {
            if (error) {
              console.log(error)
              res.writeHead(500)
              return res.end('error')
            }

            config.access_token_key = oAuthAccessToken
            config.access_token_secret = oAuthAccessTokenSecret
            config.twitter_id = JSON.parse(twitterResponse).id_str

            const body = `<meta charset="utf-8"><p>Success! Updated config:</p><pre>${JSON.stringify(config, null, 2)}</pre><p>Suggested webhook name: hook-${crypto.randomBytes(16).toString('hex')}</p>`
            res.writeHead(200, {
              'Content-Length': Buffer.byteLength(body, 'utf8'),
              'Content-Type': 'text/html',
            })
            res.end(body)
          })
        }

        oa.getOAuthAccessToken(urlObj.query.oauth_token, oAuthTokenSecret, urlObj.query.oauth_verifier, getOAuthRequestTokenCallback)
      }
    }
    const handler = handlers[urlObj.pathname]
    if (handler) {
      handler(req, res)
    } else {
      res.writeHead(404)
      res.end('invalid url')
    }
  })
}).listen(3000)

console.log('Running on http://localhost:3000')

/**
 * There are 2 ways of being put on "hold":
 *    1.) Directly through webapp -- just by clicking Hold (twilioHold, and /twilio/hold)
 *    2.) When forwarding -- it will first try directly to device, and then put on hold (/twilio/forward-hold)
 **/
Meteor.methods ({
  'twilioHold': function (origin, callId) {
    var user = Meteor.users.findOne (Meteor.userId ());
    if (!user) {
      return;
    }

    // for testing
    if (origin.indexOf ('localhost') > -1 || origin.indexOf ('pagekite') > -1 || origin.indexOf (':3000') > -1) {
      origin = 'https://' + twilioTestHost;
    }

    var call = Calls.findOne (callId);

    if (!call) {
      return;
    }

    var practice = Practices.findOne (user.practice_id);

    var twilioCredentials = getPracticeTwilioCredentials (user.practice_id);
    twilioSubaccount = Twilio (twilioCredentials.sid, twilioCredentials.authToken);

    twilioSubaccount.calls (call.external_call_sid).update ({
      url: origin + '/twilio/hold',
      method: 'GET'
    });
  },
  // this is called by the mobile device when the device has 1.) logged in and 2.) realized there is a
  // call waiting to be sent to it.  (which is what this does.)
  'twilioForwardHoldRedirect': function (origin, callId) {
    var user = Meteor.users.findOne (Meteor.userId ());
    if (!user) {
      return;
    }

    // for testing
    if (origin.indexOf ('localhost') > -1 || origin.indexOf ('pagekite') > -1 || origin.indexOf (':3000')) {
      origin = 'https://' + twilioTestHost;
    }

    var call = Calls.findOne (callId);

    // check if forward_hold_wait_count is empty -- if so, then return, as it's already been forwarded.
    if (!call || !call.forward_hold_wait_count) {
      return;
    }

    Calls.update (callId, {
      $unset: {
        'forward_hold_wait_count': ''
      }
    });

    var practice = Practices.findOne (user.practice_id);

    var twilioCredentials = getPracticeTwilioCredentials (user.practice_id);
    twilioSubaccount = Twilio (twilioCredentials.sid, twilioCredentials.authToken);

    twilioSubaccount.calls (call.external_call_sid).update ({
      url: origin + '/twilio/forward-hold-redirect/' + callId,
      method: 'GET'
    });
  }
});


Router.map (function () {
  this.route ('twilioHold', {
    path: '/twilio/hold',
    where: 'server',
    action: function () {
      var protocol = 'https:';
      var baseUrl = protocol + '//' + this.request.headers.host;

      var call = Calls.findOne ({external_call_sid: this.request.query.CallSid});
      if (call) {
        var actionUrl = baseUrl + '/twilio/exit-queue/' + call._id;
        var waitUrl = baseUrl + '/twilio/hold/wait-music';

        var twimlResponse = new Twilio.TwimlResponse ();

        // enqueue based on call's id!
        twimlResponse.enqueue ({
          action: actionUrl,
          method: 'GET',
          waitUrl: waitUrl
        }, call._id); //'OnHoldQueue');

        var call = Calls.findOne ({
          external_call_sid: this.request.query.CallSid
        });

        Calls.update (call._id, {
          $set: {
            'status': 'hold',
            'hold_at': new Date ()
          }
        });


        this.response.writeHead (200, {'Content-Type': 'text/xml'});
        this.response.end (twilioResponse.toString ());
      }
      this.response.writeHead (404);
    }
  });
});

/**
 * /twilio/forward-hold puts the user in a queue, with an actionUrl and waitUrl.
 * the waitUrl will execute up to X times until it is maxed out.  then it will
 * do a <Leave /> and send it to actionUrl, which will forward it to voicemail.
 **/
Router.map (function () {
  this.route ('twilioForwardHold', {
    path: '/twilio/forward-hold',
    where: 'server',
    action: function () {
      var protocol = 'https:';
      var baseUrl = protocol + '//' + this.request.headers.host;
      var call = Calls.findOne ({external_call_sid: this.request.query.CallSid});
      if (call) {
        Calls.update (call._id, {
          $set: {
            'forward_hold_wait_count': 0
          }
        });

        var actionUrl = baseUrl + '/twilio/exit-forward-hold-queue/' + call._id;
        var waitUrl = baseUrl + '/twilio/hold/wait-forward-hold-music/' + call._id;

        var twimlResponse = new Twilio.TwimlResponse ();

        // enqueue based on call's id!
        twimlResponse.enqueue ({
          action: actionUrl,
          method: 'GET',
          waitUrl: waitUrl
        }, call._id);


        this.response.writeHead (200, {'Content-Type': 'text/xml'});
        this.response.end (twimlResponse.toString ());
      }
      this.response.writeHead (404);
    }
  });
});
Router.map (function () {
  this.route ('twilioForwardHoldRedirect', {
    path: '/twilio/forward-hold-redirect/:call_id',
    where: 'server',
    action: function () {
      var callId = this.params.call_id;
      var protocol = 'https:';
      var baseUrl = protocol + '//' + this.request.headers.host;

      var call = Calls.findOne ({external_call_sid: this.request.query.CallSid});
      if (call) {
        var twimlResponse = new Twilio.TwimlResponse ();

        var endCallUrl = baseUrl + '/twilio/end-call/' + callId;

        // similar code as in 3-forward.js...   TODO: consolidate
        twimlResponse.dial ({
          action: endCallUrl,
          method: 'GET',
          timeout: '15'
        }, function (responseNode) {
          // for all device types, forward to this call.assigned_to
          _.each (PhoneHelpers.deviceTypes, function (curDeviceType) {
            responseNode.client (call.assigned_to + '_' + curDeviceType);
          });
        });


        this.response.writeHead (200, {'Content-Type': 'text/xml'});
        this.response.end (twimlResponse.toString ());
      }
      this.response.writeHead (404);
    }
  });
});

Router.map (function () {
  this.route ('twilioHoldWaitMusic', {
    path: '/twilio/hold/wait-music',
    where: 'server',
    action: function () {
      var twimlResponse = new Twilio.TwimlResponse ();
      twimlResponse.play ('http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3');
      this.response.writeHead (200, {'Content-Type': 'text/xml'});
      this.response.end (twimlResponse.toString ());
    }
  });
});

Router.map (function () {
  this.route ('twilioHoldHoldMusic', {
    path: '/twilio/hold/wait-forward-hold-music/:call_id',
    where: 'server',
    action: function () {
      var twimlResponse = new Twilio.TwimlResponse ();

      var call = Calls.findOne (this.params.call_id);
      if (call) {
        var waitCount = call.forward_hold_wait_count;

        if (waitCount > 1) { // time to forward them to voicemail
          twimlResponseString = '<?xml version="1.0" encoding="UTF-8"?>';
          twimlResponseString += '<Response>';
          twimlResponseString += '<Leave />';
          twimlResponseString += '</Response>';
        } else {
          waitCount++;

          twimlResponse.say ({
            voice: 'alice',
            language: 'en-GB'
          }, 'Your call is important to us.  Please wait...');

          twimlResponse.pause ({length: 90});  //TODO: add words, etc...  wait time is too long, but good for testing.

          Calls.update (call._id, {
            $set: {
              'forward_hold_wait_count': waitCount
            }
          });

          twimlResponseString = twimlResponse.toString ();
        }


        this.response.writeHead (200, {'Content-Type': 'text/xml'});
        this.response.end (twimlResponse.toString ());
      }
      this.response.writeHead (404);
    }
  });
});

Router.map (function () {
  this.route ('twilioExitQueue', {
    path: '/twilio/exit-queue/:callId',
    where: 'server',
    action: function () {
      var callId = this.params.callId;
      var twilioResponse = new Twilio.TwimlResponse ();

      var request = this.request;

      var query = request.query;

      var call = Calls.findOne (callId);
      if (call) {
        if (query.QueueResult == 'hangup') {
          Calls.update (call._id, {
            $set: {
              'status': 'completed'
            }
          });
        }


        this.response.writeHead (200, {'Content-Type': 'text/xml'});
        this.response.end (twilioResponse.toString ());
      }
      this.response.writeHead (404);
    }
  });
});

/**
 * When this is called, the QueueResult will be either:
 *    1. hangup (taken care of)
 *    2. leave (take care of)
 *    3. redirected -- not taken care of, as this will be tkaen care of elsewhere.
 **/

Router.map (function () {
  this.route ('twilioExitForwardHoldQueue', {
    path: '/twilio/exit-forward-hold-queue/:callId',
    where: 'server',
    action: function () {
      var callId = this.params.callId;
      var twilioResponse = new Twilio.TwimlResponse ();

      var request = this.request;

      var query = request.query;

      var call = Calls.findOne (callId);
      if (call) {
        if (query.QueueResult == 'hangup') {
          Calls.update (call._id, {
            $set: {
              'status': 'completed'
            }
          });
        } else if (query.QueueResult == 'leave') { // voicemail
          twilioResponse.redirect ({
            method: 'GET'
          }, call.end_call.url);
        }


        this.response.writeHead (200, {'Content-Type': 'text/xml'});
        this.response.end (twilioResponse.toString ());
      }
      this.response.writeHead (404);
    }
  });
});
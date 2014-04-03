/**
 * This will be called by Twilio if/when there's an error (like a 502).
 * Right now it will be set up to auto-retry, and this will only work
 * once (Twilio has it setup like that.)
 */
Router.map (function () {
  this.route ('twilioFallback', {
    path: '/twilio/fallback',
    where: 'server',
    action: function () {
      // this is the twilio response object that will generate the TwiML
      var twilioResponse = new Twilio.TwimlResponse ();

      var query = this.request.query;

      twilioResponse.pause ({ // wait 5 seconds...
        length: 5
      });

      twilioResponse.redirect ({  // ... and then try again
        method: 'GET'
      }, query.ErrorUrl);

      // log it for now
      console.log ('Twilio Error: ', this.request.query);

      this.response.writeHead(200, {'Content-type': 'text/xml'});
      this.response.end(twilioResponse.toString ());

      /*
      return [200, {
        'Content-type': 'text/xml'
      }, twilioResponse.toString ()];
      */
    }
  });
});

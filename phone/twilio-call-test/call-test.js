Router.map(function () {
  this.route('twilioCallTest', {
    path: '/twilio/call-test',
    where: 'server',
    action: function() {
      var twilioResponse = new Twilio.TwimlResponse(); 
      twilioResponse.say('Congratulations');
      this.response.writeHead(200, {'Content-Type': 'text/xml'});
      this.response.end(twilioResponse.toString());
    }
  });
});
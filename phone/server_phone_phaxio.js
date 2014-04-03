Router.map(function () {
  this.route('phaxio', {
  path: '/phaxio',
  where: 'server',
  action: function(){
	console.log(this.request.body);
    console.log(this.request.body.data);
	console.log(this.request.headers);
    
    var data = '';
    this.request.on('data', function(curData) {
        console.log('got data');
        data += data;
    });
    
    this.request.on('end', function() {
        console.log(data);
        console.log('--end--');
    });
}});
});
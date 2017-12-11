(function() {
    "use strict";

    /* Tell webpack what to bundle here */
    var angular = require('angular');
    require('./app');
    angular.module('dimm', ['dimm.app']);
}());
	

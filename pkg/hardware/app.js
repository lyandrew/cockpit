(function() {
    "use strict";
    var angular = require('angular');
    var cockpit = require('cockpit');


    angular.module('dimm.app', [])

    .controller('myCtrl', function($scope) {
            var ndctl_output = "";
            spawn_cmds();

            function spawn_cmds() {
                var mem_proc = cockpit.spawn(["/usr/sbin/dmidecode", "-t", "16"]);
                mem_proc.done(mem_stats);
                var nd = cockpit.spawn(["/usr/bin/ndctl", "list", "--dimms", "--health", "--idle"]);
           
                nd.done(ndctl_parse);

                var proc = cockpit.spawn(["/usr/sbin/dmidecode", "-t", "17"]);
                proc.done(cmd_parse_output);
            }

            function mem_stats(data) {
                var max_cap = data.substring(data.indexOf("Maximum Capacity: "), data.indexOf("Error Info") - 1).split(':');
                var max_slot = data.substring(data.indexOf("Number Of Devices: "), data.length).split(':');
                $scope.maxcap = max_cap[1];
                $scope.avail = max_slot[1];
                $scope.$applyAsync();
            }

            function ndctl_parse(data) {
                if (data) {
                    ndctl_output = JSON.parse(data);
                    console.log(ndctl_output);
                } else {
                    ndctl_output = false;
                }
            }

            function cmd_parse_output(data) {
                var mem = [];

                var info = data.split("\n\n");
                var header = ["Connector Name", "Memory Model", "Speed", "Type", "Size"];
                var is_using_ndctl = false;
                if (ndctl_output) {
                    is_using_ndctl = true;
                    header = ["Connector Name", "Memory Model", "Speed", "Type", "Size", "Health State", "Temp(Cel)", "% Life Used"];
                }
                $scope.header = header;
                $scope.$applyAsync();
                var installed_capacity = 0;
                var slots_used = 0;
                for (var i = 1; i < info.length - 1; i++) {
                    var dict = {};
                    var speed = info[i].substring(info[i].indexOf("Speed: "), info[i].indexOf("Manufacturer") - 1);
                    dict["speed"] = speed.split(":")[1];
                    var rank = info[i].substring(info[i].indexOf("Rank: "), info[i].indexOf("Config") - 1);
                    var typeF = info[i].substring(info[i].indexOf("Type: "), info[i].indexOf("Type Detail:") - 1);
                    var size = info[i].substring(info[i].indexOf("Size: "), info[i].indexOf("Form Factor") - 1);
                    var type_detail = info[i].substring(info[i].indexOf("Type Detail: "), info[i].indexOf("Speed: ") - 1);
                    var locator = info[i].substring(info[i].indexOf("Locator: "), info[i].indexOf("Bank Locator:") - 1);
                    var found = false;
                    if (speed.includes("Unknown") == true || speed == "") {
                        dict["locator"] = locator.split(":")[1].trim();
                        dict["size"] = "0";
                        dict["type"] = "N/A";
                        dict["rank"] = "N/A";
                        dict["type_detail"] = "N/A";
                    } else {
                        slots_used += 1;
                        dict["locator"] = locator.split(":")[1].trim();
                        dict["size"] = size.split(":")[1].trim();
                        dict["type"] = typeF.split(":")[1].trim();
                        dict["rank"] = rank.split(":")[1].trim();
                        dict["type_detail"] = type_detail.split(":")[1].trim();
                        installed_capacity += parseInt(dict["size"].split(" "));
                    }
                    if (type_detail.indexOf("Synchronous Non-Volatile Registered (Buffered)") != -1 && is_using_ndctl == true) {
                        var serial = info[i].substring(info[i].indexOf("Serial Number"), info[i].indexOf('Asset')).split(':')[1].trim();
                        serial = serial.toLowerCase();
                        found = false;
                        for (var j in ndctl_output) {
                            if (ndctl_output[j]["id"].includes(serial.toLowerCase()) === true) {
                                console.log('true');
                                found = true;
                                dict["health_state"] = ndctl_output[j]["health"]["health_state"];
                                dict["temp"] = ndctl_output[j]["health"]["temperature_celsius"];
                                dict["life"] = ndctl_output[j]["health"]["life_used_percentage"] + '%';
                            }
                        }
                    }
                    if (found == false && is_using_ndctl == true) {
                        dict["health_state"] = ' ';
                        dict["temp"] = ' ';
                        dict["life"] = ' ';
                    }
                    mem.push(dict);
                }
                $scope.slots = slots_used;
                $scope.installed = installed_capacity + " MB";
                $scope.memory = mem;
                $scope.$applyAsync();
            }
        });
}());

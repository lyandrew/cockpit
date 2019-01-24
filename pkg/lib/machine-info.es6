/* eslint-disable */
/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2018 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import cockpit from "cockpit";
const _ = cockpit.gettext;

var cpu_ram_info_promises = { };

export function cpu_ram_info(address) {
    var pr = cpu_ram_info_promises[address];
    var dfd;
    if (!pr) {
        dfd = cockpit.defer();
        cpu_ram_info_promises[address] = pr = dfd.promise();

        cockpit.spawn(["cat", "/proc/meminfo", "/proc/cpuinfo"], { host: address })
                .done(function(text) {
                    var info = { };
                    var match = text.match(/MemTotal:[^0-9]*([0-9]+) [kK]B/);
                    var total_kb = match && parseInt(match[1], 10);
                    if (total_kb)
                        info.memory = total_kb * 1024;

                    match = text.match(/^model name\s*:\s*(.*)$/m);
                    if (match)
                        info.cpu_model = match[1];

                    info.cpus = 0;
                    var re = /^processor/gm;
                    while (re.test(text))
                        info.cpus += 1;
                    dfd.resolve(info);
                })
                .fail(function() {
                    dfd.reject();
                });
    }
    return pr;
}

// https://www.dmtf.org/sites/default/files/standards/documents/DSP0134_2.7.1.pdf
const chassis_types = [
    undefined,
    _("Other"),
    _("Unknown"),
    _("Desktop"),
    _("Low Profile Desktop"),
    _("Pizza Box"),
    _("Mini Tower"),
    _("Tower"),
    _("Portable"),
    _("Laptop"),
    _("Notebook"),
    _("Hand Held"),
    _("Docking Station"),
    _("All In One"),
    _("Sub Notebook"),
    _("Space-saving Computer"),
    _("Lunch Box"), /* 0x10 */
    _("Main Server Chassis"),
    _("Expansion Chassis"),
    _("Sub Chassis"),
    _("Bus Expansion Chassis"),
    _("Peripheral Chassis"),
    _("RAID Chassis"),
    _("Rack Mount Chassis"),
    _("Sealed-case PC"),
    _("Multi-system Chassis"),
    _("Compact PCI"), /* 0x1A */
    _("Advanced TCA"),
    _("Blade"),
    _("Blade enclosure"),
    _("Tablet"),
    _("Convertible"),
    _("Detachable"), /* 0x20 */
    _("IoT Gateway"),
    _("Embedded PC"),
    _("Mini PC"),
    _("Stick PC"),
];

function parseDMIFields(text) {
    var info = {};
    text.split("\n").map(line => {
        let sep = line.indexOf(':');
        if (sep <= 0)
            return;
        let key = line.slice(0, sep);
        let value = line.slice(sep + 1);
        info[key] = value;

        if (key === "chassis_type")
            info[key + "_str"] = chassis_types[parseInt(value)] || chassis_types[2]; // fall back to "Unknown"
    });
    return info;
}

var dmi_info_promises = { };

export function dmi_info(address) {
    var pr = dmi_info_promises[address];
    var dfd;
    if (!pr) {
        dfd = cockpit.defer();
        dmi_info_promises[address] = pr = dfd.promise();

        cockpit.spawn(["grep", "-r", "."],
                      { directory: "/sys/class/dmi/id", err: "ignore", superuser: "try" })
                .done(output => dfd.resolve(parseDMIFields(output)))
                .fail((exception, output) => {
                // the grep often/usually exits with 2, that's okay as long as we find *some* information
                    if (!exception.problem && output)
                        dfd.resolve(parseDMIFields(output));
                    else
                        dfd.reject(exception.message);
                });
    }
    return pr;
}

/* we expect udev db paragraphs like this:
 *
   P: /devices/virtual/mem/null
   N: null
   E: DEVMODE=0666
   E: DEVNAME=/dev/null
   E: SUBSYSTEM=mem
*/

const udevPathRE = /^P: (.*)$/;
const udevPropertyRE = /^E: (\w+)=(.*)$/;

function parseUdevDB(text) {
    var info = {};
    text.split("\n\n").map(paragraph => {
        let syspath = null;
        let props = {};

        paragraph = paragraph.trim();
        if (!paragraph)
            return;

        paragraph.split("\n").map(line => {
            let match = line.match(udevPathRE);
            if (match) {
                syspath = match[1];
            } else {
                match = line.match(udevPropertyRE);
                if (match)
                    props[match[1]] = match[2];
            }
        });

        if (syspath)
            info[syspath] = props;
        else
            console.log("udev database paragraph is missing P:", paragraph);
    });
    return info;
}

var udev_info_promises = { };

export function udev_info(address) {
    var pr = udev_info_promises[address];
    var dfd;
    if (!pr) {
        dfd = cockpit.defer();
        udev_info_promises[address] = pr = dfd.promise();

        cockpit.spawn(["udevadm", "info", "--export-db"], { err: "message" })
                .done(output => dfd.resolve(parseUdevDB(output)))
                .fail(exception => dfd.reject(exception.message));
    }
    return pr;
}

const memoryRE = /^([ \w]+): (.*)/;

// Process the dmidecode text output and create a mapping of locator to dimm properties {"A1": {Array Handle: "0x1000"...,},...}
function parseMemoryInfo(text) {
    var info = {};
    text.split("\n\n").map(paragraph => {
        let locator = null;
        let props = {};

        paragraph = paragraph.trim();
        if (!paragraph)
            return;

        paragraph.split("\n").map(line => {
            line = line.trim();
            let match = line.match(memoryRE);
            if (match)
                props[match[1]] = match[2];
        });

        locator = props["Locator"];
        if (locator)
            info[locator] = props;
    });

    return processMemory(info);
}

// Select the useful properties to display
function processMemory(info) {
    var memory_array = [];
    var empty_slots = 0;

    for (let dimm in info) {
        let memory = info[dimm];
        if (memory["Type Detail"] == "None") {
            empty_slots += 1;
        }
        memory_array.push({ locator: memory["Locator"],
                            manufacturer: memory["Manufacturer"],
                            type_detail: memory["Type Detail"],
                            size: memory["Size"],
                            speed: memory["Speed"],
                            part_number: memory["Part Number"],
                            serial: memory["Serial Number"] });
    }
    return {"array": memory_array, "empty_slots": empty_slots};
}

var memory_info_promises = { };

// Calls dmidecode to gather memory information. Returns array of properties mapping and number of empty slots for preprocessing.
// Return {"array": memory, "empty_slots": #}
export function memory_info(address) {
    var pr = memory_info_promises[address];
    var dfd;

    if (!pr) {
        dfd = cockpit.defer();
        memory_info_promises[address] = pr = dfd.promise();
        // cockpit.spawn(["/usr/sbin/dmidecode", "-t", "memory"], { environ: ["LC_ALL=C"], err: "message", superuser: "try" })
        cockpit.spawn(["cat", "/tmp/dmid-nvdimm.txt"], { environ: ["LC_ALL=C"], err: "message", superuser: "try" })
                .done(output => dfd.resolve(parseMemoryInfo(output)))
                .fail(exception => dfd.reject(exception.message));
    }
    return pr;
}

function parseNdctl(text) {
    var nd_dict = {};

    var obj = JSON.parse(text);
    for ( var i=0; i < obj.length; i++) {
        var id = obj[i]["id"];
        id = id.toUpperCase();
        var token = id.split('-');
        nd_dict[token[3]] = obj[i];
    }
    return nd_dict;
}

var ndctl_info_promises = {};

export function ndctl_info(address) {
    var pr = ndctl_info_promises[address];
    var dfd;

    if (!pr) {
        dfd = cockpit.defer();
        ndctl_info_promises[address] = pr = dfd.promise();
        cockpit.spawn(["cat", "/tmp/ndctl-list.txt"], { environ: ["LC_ALL=C"], err: "message", superuser: "try" })
                .done(output => dfd.resolve(parseNdctl(output)))
                .fail(exception => dfd.reject(exception.message));
    }
    return pr;
}

function processDisks(text) {
    var text1 = [{'47N007A': [{'status': 2, 'name': 'Disk 1 TOSHIBA AL13SXB300N     ', 'size_bytes': 299439751168, 'block_size': 512, 'rpm': 1, 'id': '94E0A069F92A'}, {'status': 2, 'name': 'Disk 3 TOSHIBA AL13SXB300N     ', 'size_bytes': 299439751168, 'block_size': 512, 'rpm': 1, 'id': '9430A0BAF92A'}, {'status': 2, 'name': 'Disk 0 TOSHIBA AL13SXB300N     ', 'size_bytes': 299439751168, 'block_size': 512, 'rpm': 1, 'id': '9480A012F92A'}, {'status': 2, 'name': 'Disk 2 TOSHIBA AL13SXB300N     ', 'size_bytes': 299439751168, 'block_size': 512, 'rpm': 1, 'id': '94E0A05LF92A'}]}, {'47N007A:DG0': {'pool_member': '9480A012F92A 94E0A069F92A 94E0A05LF92A 9430A0BAF92A', 'total_space': 898319253504, 'free_space': 0, 'id': '47N007A:DG0', 'name': 'RAID5 Disk Group 0'}}];
    var disks = text1[0];
    var raids = text1[1];
    var raid_arr = [];
    function formatBytes(bytes) {
        if(bytes < 1024) return bytes + " Bytes";
        else if(bytes < 1048576) return(bytes / 1024).toFixed(3) + " KB";
        else if(bytes < 1073741824) return(bytes / 1048576).toFixed(3) + " MB";
        else return(bytes / 1073741824).toFixed(3) + " GB";
    };
    for (let i in raids) {
        raids[i]['total_space'] = formatBytes(raids[i]['total_space']);
        raid_arr.push(raids[i]);
        console.log(raids[i]);
    }
    for (let key in disks) {
        for (let i in disks[key]) {
            disks[key][i]['size_bytes'] = formatBytes(disks[key][i]['size_bytes']);
        }
    }
    console.log(disks);
    console.log('returning proccess disks');
    var res = [];
    res.push(disks);
    res.push(raid_arr);
    return res;
}
var disk_info_promises = {};
export function disk_info(address) {
    var pr = disk_info_promises[address];
    var dfd;
    if (!pr) {
        dfd = cockpit.defer();
        disk_info_promises[address] = pr = dfd.promise();
        cockpit.spawn(["/tmp/disks.sh"], { environ: ["LC_ALL=C"], err: "message", superuser: "try" })
                .done(output => dfd.resolve(processDisks(output)))
                .fail(exception => dfd.reject(exception.message));
    }
    return pr;
}

const biosRE = /^#?(.*)=(.*)/;

function processBios1(text) {
    var obj = JSON.parse(text);
    console.log(obj["Attributes"]);
    let settings = obj["Attributes"];
    return settings;
}
var bios_info_promises = {};
export function bios_info(address) {
    var pr = bios_info_promises[address];
    var dfd;
    if (!pr) {
        dfd = cockpit.defer();
        bios_info_promises[address] = pr = dfd.promise();
        cockpit.spawn(["/tmp/bios.sh"], { environ: ["LC_ALL=C"], err: "message", superuser: "try" })
                .done(output => dfd.resolve(processBios1(output)))
                .fail(exception => dfd.reject(exception.message));
    }
    return pr;
}

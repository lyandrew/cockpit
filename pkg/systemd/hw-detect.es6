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

import * as machine_info from "machine-info.es6";

// map an info.system key to a /sys/class/dmi/id/* attribute name
const InfoDMIKey = {
    version: "product_version",
    name: "product_name",
    type: "chassis_type_str",
    bios_vendor: "bios_vendor",
    bios_version: "bios_version",
    bios_date: "bios_date",
};

function getDMI(info) {
    return new Promise((resolve, reject) => {
        machine_info.dmi_info()
                .done(fields => {
                    Object.keys(InfoDMIKey).forEach(key => {
                        info.system[key] = fields[InfoDMIKey[key]];
                    });
                    resolve();
                })
                .fail(reject);
    });
}

// Add info.pci [{slot, cls, vendor, model}] list
function findPCI(udevdb, info) {
    for (let syspath in udevdb) {
        let props = udevdb[syspath];
        if (props.SUBSYSTEM === "pci")
            info.pci.push({ slot: props.PCI_SLOT_NAME || syspath.split("/").pop(),
                            cls: props.ID_PCI_CLASS_FROM_DATABASE || props.PCI_CLASS.toString(),
                            vendor: props.ID_VENDOR_FROM_DATABASE || "",
                            model: props.ID_MODEL_FROM_DATABASE || props.PCI_ID || "" });
    }
}

// Parse and add to info.dmi.dimm = [{"speed":"11 MHz","locator":"A3", ...}]
function processDMIDE(res, info) {
  var dimms = [];
  var data = res.split("\n\n");
  for (var i = 1; i < data.length - 1; i++) {
      if (data[i].length == 0) {
        continue;
      }
      var dict = {};
      var speed = data[i].substring(data[i].indexOf("Speed: "), data[i].indexOf("Manufacturer") - 1);
      var dimm_type = data[i].substring(data[i].indexOf("Type: "), data[i].indexOf("Type Detail:") - 1);
      var size = data[i].substring(data[i].indexOf("Size: "), data[i].indexOf("Form Factor") - 1);
      var type_detail = data[i].substring(data[i].indexOf("Type Detail: "), data[i].indexOf("Speed: ") - 1);
      var locator = data[i].substring(data[i].indexOf("Locator: "), data[i].indexOf("Bank Locator:") - 1);
      var serial = data[i].substring(data[i].indexOf("Serial Number: "), data[i].indexOf("Asset Tag: ") - 1);
      var vendor = data[i].substring(data[i].indexOf("Manufacturer: "), data[i].indexOf("Serial Number: ") - 1);
      var part_number = data[i].substring(data[i].indexOf("Part Number: "), data[i].indexOf("Rank: ") - 1);
      if (speed.includes("Unknown") == true || speed == "") {
          dict["locator"] = locator.split(":")[1].trim();
          dict["size"] = "";
          dict["type"] = "";
          dict["type_detail"] = "[empty]";
          dict["serial"] = "";
          dict["speed"] = "";
          dict["part_number"] = "";
          dict["vendor"] = "";
      } else {
          dict["speed"] = speed.split(":")[1].trim();
          dict["locator"] = locator.split(":")[1].trim();
          dict["size"] = size.split(":")[1].trim();
          dict["type"] = dimm_type.split(":")[1].trim();
          dict["type_detail"] = dict["type"] + " " + type_detail.split(":")[1].trim();
          dict["serial"] = serial.split(":")[1].trim();
          dict["part_number"] = part_number.split(":")[1].trim();
          dict["vendor"] = vendor.split(":")[1].trim();
      }
      dimms.push(dict);
  }
  info.dmi.dimms = dimms;
}

export default function detect() {
    let info = { system: {}, pci: [], dmi: {} };
    var tasks = [];

    tasks.push(new Promise((resolve, reject) => {
        machine_info.cpu_ram_info()
                .done(result => {
                    info.system.cpu_model = result.cpu_model;
                    info.system.nproc = result.cpus;
                    resolve();
                });
    }));

    tasks.push(new Promise((resolve, reject) => {
        getDMI(info)
                .then(() => resolve())
                .catch(error => {
                // DMI only works on x86 machines; check devicetree (or what lshw does) on other arches
                    console.warn("Failed to get DMI information:", error.toString());
                    resolve();
                });
    }));

    tasks.push(new Promise((resolve, reject) => {
        machine_info.udev_info()
                .done(result => {
                    findPCI(result, info);
                    resolve();
                })
                .catch(error => {
                    console.warn("Failed to get udev information:", error.toString());
                    resolve();
                });
    }));

    tasks.push(new Promise((resolve, reject) => {
        machine_info.dmide_info()
            .done(result => {
                processDMIDE(result, info);
                resolve();
            })
            .catch(error => {
                console.warn("Failed to get dmidecode information:", error.toString());
                resolve();
            });
    }));

    // return info after all task promises got done
    return new Promise((resolve, reject) => {
        Promise.all(tasks).then(() => resolve(info));
    });
}

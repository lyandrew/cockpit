To install cockpit:
$ ./configure
$ ./autogen
$ make

cp cockpit/temp/* /tmp/
# make sure the .sh files have executive permissions

Dev Notes:

A lot of the tasks right now (to get data output (dmidecode, racadm)) are placed in bash files that are runnable. So these files are run by cockpit. It is possible to call these cmdline directly thru cockpit.




These 4 files are edited to add the RAID/DIMM/BIOS information.


pkg/lib/cockpit-components-listing.jsx
pkg/lib/machine-info.es6
pkg/systemd/hw-detect.es6
pkg/systemd/hwinfo.jsx


pkg/lib/cockpit-components-listing.jsx - Edited the listing library to include inline css.


Start with:

pkg/systemd/hw-detect.es6 - Create a task and store it for future use (hwinfo).  For example:

The important stuff to note here is memory_info. 
 tasks.push(new Promise((resolve, reject) => {
        machine_info.memory_info()
                .done(result => {
                    info.memory = result;
                    resolve();
                })
                .catch(error => {
                    console.warn("Failed to get dmidecode information:", error.toString());
                    resolve();
                });
    }));








pkg/lib/machine-info.es6 - Define the task in this file. What should the task do? Cockpit can make a syscall (dmidecode, racadam, cat <file>, ./bash.sh).

var memory_info_promises = { };
// Calls dmidecode to gather memory information. Returns array of properties mapping and number of empty slots for preprocessing.
// Return {"array": memory, "empty_slots": #}
export function memory_info(address) {
    var pr = memory_info_promises[address];
    var dfd;

    if (!pr) {
        dfd = cockpit.defer();
        memory_info_promises[address] = pr = dfd.promise();
        cockpit.spawn(["/usr/sbin/dmidecode", "-t", "memory"], { environ: ["LC_ALL=C"], err: "message", superuser: "try" })
        // debug: cockpit.spawn(["cat", "/tmp/dmid-nvdimm.txt"], { environ: ["LC_ALL=C"], err: "message", superuser: "try" })
                .done(output => dfd.resolve(parseMemoryInfo(output)))
                .fail(exception => dfd.reject(exception.message));
    }

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


Note that parseMemoryInfo is a function to change the data into an output you want (ie. from line of text to json readable).







pkg/systemd/hwinfo.jsx- The front end layer. Contains javascript code to 
info.memory.array was defined earlier in the code. we need to call this.props.info.memory.array to retrieve it in this file.
 memory = (
                <div id="memory_table">
                    <Listing title={ _("Memory") } actions={ [ empty_span ] }
                             columnTitles={ [ _("ID"), _("Description"), _("Vendor"), _("Model"), _("Size"), _("Clock Speed"), _("Serial") ] } >
                        { this.props.info.memory.array.map(dimm => {
                            var ndctl = this.props.info.ndctl;
                            var list = null;
                            if (dimm.type_detail == "None") {
                                empty_slots += 1;
                                list = <ListingRow extraClass="ct-empty-slot"
                                                   columns={[ dimm.locator, "Empty Slot", "", "", "", "", "" ]} />;
                            } else {


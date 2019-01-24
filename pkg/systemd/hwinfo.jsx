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
import moment from 'moment';
import '../lib/polyfills.js'; // once per application
import React from "react";
import ReactDOM from 'react-dom';

import { Listing, ListingRow } from "cockpit-components-listing.jsx";

import detect from "./hw-detect.es6";

const _ = cockpit.gettext;

const SystemInfo = ({ info }) => (
    <table className="info-table-ct wide-split-table-ct">
        <tbody>
            <tr>
                <th>{ _("Type") }</th>
                <td>{ info.type }</td>
            </tr>
            <tr>
                <th>{ _("Name") }</th>
                <td>{ info.name }</td>
            </tr>
            <tr>
                <th>{ _("Version") }</th>
                <td>{ info.version }</td>
            </tr>
        </tbody>
        <tbody>
            <tr>
                <th>{ _("BIOS") }</th>
                <td>{ info.bios_vendor }</td>
            </tr>
            <tr>
                <th>{ _("BIOS version") }</th>
                <td>{ info.bios_version }</td>
            </tr>
            <tr>
                <th>{ _("BIOS date") }</th>
                <td>{ moment(info.bios_date).isValid() ? moment(info.bios_date).format('L') : info.bios_date }</td>
            </tr>
            <tr>
                <th>{ _("CPU") }</th>
                <td>{ (info.nproc > 1) ? `${info.nproc}x ${info.cpu_model}` : info.cpu_model }</td>
            </tr>
        </tbody>
    </table>
);

class NVDetails extends React.Component {
    render() {
        let k = [ "dev", "id", "handle", "phys_id", "flag_failed_flush", "flag_smart_event", "alarm_controller_temperature", "alarm_enabled_ctrl_temperature", "alarm_enabled_media_temperature", "alarm_enabled_spares", "alarm_spares", "alarm_temperature", "controller_temperature_celsius", "temperature_celsius", "spares_percentage", "health_state", "life_used_percentage", "shutdown_state", "shutdown_count" ];
        //  "alarm_enabled_media_temperature", "alarm_enabled_spares", "alarm_spares", "alarm_temperature", "controller_temperature_celsius", "temperature_celsius", "spares_percentage", "health_state", "life_used_percentage", "shutdown_state", "shutdown_count" ];
        let detail = Object.assign({}, ...(function _flatten(o) { return [].concat(...Object.keys(o).map(k => typeof o[k] === 'object' ? _flatten(o[k]) : ({[k]: o[k]}))) }(this.props.ndctl[this.props.dimm.serial])));
        console.log(detail);
        return (
            // <pre>
            //    {JSON.stringify(this.props.ndctl[this.props.dimm.serial], null, '\t')}
            // </pre>

            <Listing title={ _("Details") } columnTitles={ [ _("Key"), _("Value") ] } >
                { k.map(ke =>
                    <ListingRow columns={[ ke, String(detail[ke]) ]} />
                )}
            </Listing>
        );
    }
}

class DiskDetails extends React.Component {
    render() {
        console.log(this.props.disk);
        let disk = [ this.props.disk ];
        return (
        // <pre>
        //     {JSON.stringify(this.props.disk, null, '\t')}
        // </pre>
            <Listing title={ _(this.props.disk.name) } columnTitles={ [ _("Status"), _("Size (Bytes)"), _("ID"), _("RPM"), _("Block") ] } >

                { disk.map(dev => <ListingRow columns={[ dev.status, dev.size_bytes, dev.id, dev.rpm, dev.block_size ]} />) }
            </Listing>
        );
    }
}

class HardwareInfo extends React.Component {
    constructor(props) {
        super(props);
        this.sortColumnFields = [ "cls", "model", "vendor", "slot" ];
        this.state = { sortBy: "cls" };
    }

    render() {
        let pci = null;
        let memory = null;
        let disks = null;
        let raids = null;
        let bios = null;
        let $ = require("jquery");

        if (this.props.info.pci.length > 0) {
            let sortedPci = this.props.info.pci.concat();
            sortedPci.sort((a, b) => a[this.state.sortBy].localeCompare(b[this.state.sortBy]));

            pci = (
                <div id="pci_table">
                    <Listing title={ _("PCI") } columnTitles={ [ _("Class"), _("Model"), _("Vendor"), _("Slot") ] }
                             columnTitleClick={ index => this.setState({ sortBy: this.sortColumnFields[index] }) } >
                        { sortedPci.map(dev => <ListingRow columns={[ dev.cls, dev.model, dev.vendor, dev.slot ]} />) }
                    </Listing>
                </div>
            );
        }

        console.log(this.props.info.raid);
        if (this.props.info.raid.length > 0) {
            raids = (
                <div id="raid_table">
                    <Listing title={ _("RAID") } columnTitles={ [ _("ID"), _("Name"), _("Free Space"), _("Total Space") ] } >
                        { this.props.info.raid.map(raid => {
                            var key = null;
                            if (raid.id in this.props.info.disk) {
                                key = raid.id;
                            } else {
                                if (raid.id.indexOf(":") > -1) {
                                    key = raid.id.split(':')[0];
                                }
                            }
                            console.log(key);

                            var raid_members = this.props.info.disk[key];
                            console.log(raid_members);
                            var tabRenderers = [ ];
                            for (var i = 0; i < raid_members.length; i++) {
                                tabRenderers.push({ name: _(raid_members[i].name), renderer: DiskDetails, data: { disk: raid_members[i] } });
                            }

                            return <ListingRow tabRenderers={tabRenderers} columns={[ raid.id, raid.name, raid.free_space, raid.total_space ]} />;
                        })}
                    </Listing>
                </div>
            );
        }

        //        if (this.props.info.disk.length > 0) {
        //            disks = (
        //                <div id="disks_table">
        //                    <Listing title={ _("DISKS") } columnTitles={ [ _("ID"), _("Name"), _("System ID") ] }
        //                             columnTitleClick={ index => this.setState({ sortBy: this.sortColumnFields[index] }) } >
        //                        { this.props.info.disk.map(disk => <ListingRow columns={[ disk.id, disk.name, disk.system_id ]} />) }
        //                    </Listing>
        //                </div>
        //            );
        //        }

        console.log(this.props.info.bios);
        if (this.props.info.bios) {
            console.log(this.props.info.bios);
            let bios_arr = Object.keys(this.props.info.bios);
            console.log(bios_arr);
            bios = (
                <div id="bios_table">
                    <Listing title={ _("BIOS") } columnTitles={ [ _("Key"), _("Value") ] } >
                        { bios_arr.map(k =>
                            <ListingRow columns={[ k, this.props.info.bios[k] ]} />
                        )}
                    </Listing>
                </div>
            );
        }

        console.log(this.props.info.ndctl);
        if (this.props.info.memory.array.length > 0) {
            let empty_span = null;
            let display_all = function(e) {
                $('#memory_table').addClass('show-all-slots');
                $('#view-all-slots').hide();
            };
            let empty_slots = this.props.info.memory.empty_slots;
            if (this.props.info.memory.empty_slots > 0) {
                empty_span = (
                    <span className="ct-hardware-memory-empty-count">
                        {empty_slots} empty slots
                        <a
                            href="#memory_table"
                            id="view-all-slots"
                            onClick={display_all}
                        >
                            view all
                        </a>
                    </span>
                );
            }
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
                                if (dimm.serial in ndctl) {
                                    var tabRenderers = [
                                        {
                                            name: _("Details"),
                                            renderer: NVDetails,
                                            data: {dimm: dimm, ndctl: ndctl, sortedPci: this.props.info.pci.concat()}
                                        },
                                    ];
                                    list = <ListingRow tabRenderers={tabRenderers} columns={[ dimm.locator, dimm.type_detail, dimm.manufacturer,
                                        dimm.part_number, dimm.size, dimm.speed, dimm.serial ]} />;
                                } else {
                                    list = <ListingRow columns={[ dimm.locator, dimm.type_detail, dimm.manufacturer,
                                        dimm.part_number, dimm.size, dimm.speed, dimm.serial ]} />;
                                }
                            }
                            return list;
                        })}
                    </Listing>
                </div>
            );
            console.log(memory);
        }

        return (
            <div className="page-ct container-fluid">
                <ol className="breadcrumb">
                    <li><a role="link" tabIndex="0" onClick={ () => cockpit.jump("/system", cockpit.transport.host) }>{ _("System") }</a></li>
                    <li className="active">{ _("Hardware Information") }</li>
                </ol>

                <h2>{ _("System Information") }</h2>
                <SystemInfo info={this.props.info.system} />

                { raids }
                { disks }
                { memory }
                { bios }
                { pci }
            </div>
        );
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.title = cockpit.gettext(document.title);
    moment.locale(cockpit.language);
    detect().then(info => {
        console.debug("hardware info collection data:", JSON.stringify(info));
        ReactDOM.render(<HardwareInfo info={info} />, document.getElementById("hwinfo"));
    });
});

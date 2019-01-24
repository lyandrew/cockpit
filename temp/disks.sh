#!/usr/bin/python2
import lsm

# Make connection.
lsm_cli_obj = lsm.Client("megaraid://")
#lsm_cli_obj = lsm.Client("sim://")

# Enumerate Storage Pools.
pools = lsm_cli_obj.pools()
pools_dir = {}
disks = {}
d_arr = []
raid = {}
for disk in lsm_cli_obj.disks():
    disks[disk.id] = {"id": disk.id, "block_size": disk.block_size, "name": disk.name,
                      "system_id": disk.system_id, "rpm": disk.rpm}
    d_arr.append(disks[disk.id])
    if disk.system_id not in raid:
        raid[disk.system_id] = [{"id": disk.id, "block_size": disk.block_size, "name": disk.name,"rpm": disk.rpm, "size_bytes": disk.size_bytes, "status": disk.status}]
    else:
        raid[disk.system_id].append({"id": disk.id, "block_size": disk.block_size, "name": disk.name,"rpm": disk.rpm, "size_bytes": disk.size_bytes, "status": disk.status})

# Use pool information.
for p in pools:
    pools_member = lsm_cli_obj.pool_member_info(p)
    members = []
    for member_id in pools_member[2]:
        if member_id not in disks:
            continue
#        members.append(disks[member_id])
        members.append(member_id)

    pools_dir[p.id] = {"id": p.id, "free_space": p.free_space, "name": p.name, "total_space": p.total_space, "pool_member": " ".join(members)}

import json, ast
pools_dir = ast.literal_eval(json.dumps(pools_dir))
disks = ast.literal_eval(json.dumps(raid))
print [disks, pools_dir]



# Close connection
if lsm_cli_obj is not None:
    lsm_cli_obj.close()

# Matrix Agent Node Clients

Remote nodes extend Matrix Agent with **camera**, **location**, **notifications**, and **shell commands** from other devices (phone, Raspberry Pi, server).

## 1. Mobile node (phone / tablet)

**Best for:** camera, location, push notifications.

- Open **http://\<your-PC-IP\>:18792/** in your phone’s browser (same Wi‑Fi as the PC running AgentPrime).
- Or open `mobile-node/index.html` from any web server and enter your PC IP and port (e.g. `192.168.1.100:18792`).
- In AgentPrime: **Matrix Agent → SYSTEMS → Nodes → Generate pairing code**.
- Enter that code and tap **Pair & connect**. Grant camera/location/notification when asked.

Matrix Agent can then use: **node_camera**, **node_screen**, **node_location**, **node_notify**, **node_canvas** for that device.

## 2. Server / hub node (Raspberry Pi, server, spare PC)

**Best for:** 24/7 autonomy, running commands and notifications when your main PC is off.

```bash
cd node-clients/server-node
npm install
PAIRING_CODE=A1B2C3 AGENTPRIME_HOST=192.168.1.100 node run.js
# Or: node run.js --code A1B2C3 --host 192.168.1.100
```

Get the pairing code from AgentPrime: **Matrix Agent → SYSTEMS → Nodes → Generate pairing code**.  
Use your main PC’s IP for `AGENTPRIME_HOST` when the node runs on another machine.

Optional: `NODE_NAME=Living Room Pi` to label the node.

Matrix Agent can then use: **nodes_command** with `type: "shell.execute"` and `params: { command: "..." }`, **node_notify**, and **node_canvas** (if the node supports it) to that node.

## Node actions (Matrix Buddy)

Matrix Agent uses **nodes_list()** first to discover paired devices and their capabilities. Then it can use:

| Action | Params | Use case |
|--------|--------|----------|
| **node_camera** | nodeId, optional `facing`: "front" \| "back" | Capture photo from device camera |
| **node_screen** | nodeId | Capture screenshot from device screen |
| **node_location** | nodeId | Get device GPS (e.g. "Where's my phone?") |
| **node_notify** | nodeId, title, body | Push notification to device |
| **node_canvas** | nodeId, html | Display HTML/content on device screen |
| **nodes_command** | nodeId, type, params | Raw command: `camera.capture`, `screen.capture`, `location.get`, `notification.send`, `canvas.display`, `shell.execute` |

This gives Matrix Buddy a clear chain of thought: list nodes → pick nodeId/capability → run the right action.

## Enabling nodes

Nodes are **enabled** when you use Matrix Agent (the nodes server starts automatically).  
To pair, generate a code in **Matrix Systems → Nodes** and use it in the mobile page or server-node as above.

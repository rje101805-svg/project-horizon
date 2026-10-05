# Step 3 manual test on Windows

This is the user's acceptance test. Automated tests pass, but a human must still assess how flight/interpolation feels. Step 4 and public deployment have not started.

## Update your project

Use your existing downloaded/cloned `project-horizon` folder. If you use Git, follow these actions one at a time:

1. Open that folder in Windows File Explorer.
2. Click the address bar at the top of File Explorer.
3. Type `cmd` and press Enter. A Command Prompt window opens in the correct folder. This is your first terminal.
4. Type `git switch work` and press Enter.
5. Type `git pull` and press Enter.
6. Type `npm ci` and press Enter. Wait until it finishes.

If you do not have Git, download the ZIP from https://github.com/rje101805-svg/project-horizon/tree/work using **Code → Download ZIP**, extract it, and open the extracted folder. Then do actions 2, 3 and 6. If `npm` is not recognized, install Node.js 24 LTS from https://nodejs.org, then close and reopen Command Prompt.

## Start the server and client

7. In the first terminal, type `npm run server` and press Enter.
8. Wait for the line saying `Horizon flight server: http://localhost:3001 (30 ticks/s)`.
9. Leave that terminal open and running.
10. Return to the project folder in File Explorer.
11. Click its address bar, type `cmd`, and press Enter. This opens a second terminal in the same folder.
12. In the second terminal, type `npm run dev` and press Enter.
13. Leave the second terminal open and running.
14. Open Chrome or Edge on this same Windows computer.
15. Enter `http://localhost:5173` in the browser address bar and press Enter. This is Tab A.

If Vite prints a different port, an old client may already be running. Stop the old terminal with Ctrl+C and start again, so you use port 5173. No GitHub Pages address is needed for this test. Localhost here works because you started both programs on your own computer.

## Create and join a room

16. In Tab A, type `Nova` into Display name.
17. Leave Flight server URL as `http://localhost:3001`.
18. Click **Create room**.
19. Wait for **Connected · server-authoritative flight · 30 Hz** below the game.
20. Read the four-character room code above the game. You should see **1 / 8 players**.
21. Click **Copy code** (or write the code down).
22. Open a new browser tab with Ctrl+T. This is Tab B.
23. Enter `http://localhost:5173` and press Enter.
24. Type `Orion` into Display name.
25. Paste/type Tab A's room code into Room code. Lowercase also works.
26. Click **Join room**.
27. Check that Tab B shows **2 / 8 players**, two differently colored ships, and both names. Your own name has `(you)` after it.
28. Switch to Tab A and check the same things there.

## Fly independently and inspect the other ship

29. In Tab A, hold D for about one second, then release it. Nova should move right and coast to a stop.
30. Hold W and Shift briefly, then release both. Nova should boost.
31. Switch to Tab B. Orion should still be at Orion's starting position; Nova should have moved.
32. In Tab B, hold S briefly, then release it. Only Orion should move down.
33. Switch to Tab A and check Orion's new position.

To watch the other player while they move, place the two clients in separate browser windows beside each other:

34. Drag Tab B out of its tab bar to make it a separate window.
35. Resize/place the two browser windows so you can see both game canvases.
36. Click Nova's window and hold a movement key while watching Nova from Orion's window. Remote movement should look smoother than individual 33ms jumps.
37. Click Orion's window and repeat in the other direction.

Only the focused window receives your keyboard input. Losing focus releases movement, so a tab should not keep thrusting forever. Inactive/hidden tabs can throttle rendering; use two visible windows to judge smoothness. Keep the ships reasonably close so both remain visible. The minimap shows ships that are off-screen.

## Test development fake lag

38. In Nova's game, check **DEV ONLY: fake network · 100ms each way ±30ms jitter** above the HUD.
39. In Orion's game, check the same option.
40. Fly Nova while watching from Orion's window.
41. Fly Orion while watching from Nova's window.
42. Expect delayed local response (no prediction) and delayed but reasonably smooth remote movement. The server still simulates 30Hz. Check for large jumps, drifting ships after input release, or errors.
43. Uncheck the fake-network checkbox in both windows. This cancels queued debug packets and restores normal networking immediately.

The checkbox is available only with `npm run dev`. It does not exist as an active option in production. This adds ~100ms in each direction (~200ms round trip before the extra 100ms remote interpolation delay). Room creation/join and reliable departures are not delayed. This is a small local timing simulator, not a full packet-loss/bandwidth emulator.

## Disconnect and leave

44. Close Orion's browser window/tab.
45. Watch Nova's window. Orion's ship/name should disappear and the count should become **1 / 8 players**.
46. Fly Nova again. Nova should remain functional.
47. Click **Back to home**. This leaves the room. Since Nova was the last player, that room is now deleted.
48. Enter the old code and click **Join room**. You should get a clean **Room not found** message.

## Join by link

49. Click **Create room** to make a new room.
50. Click **Copy join link**.
51. Open a new browser tab.
52. Paste the copied URL into the address bar and press Enter.
53. Check that the room code is prefilled in uppercase and that you are still on the home screen.
54. Enter a different display name.
55. Click **Join room**. Confirm two ships/players again.

The link has the form `http://localhost:5173/?room=ABCD`. Substitute your actual generated code; `ABCD` is only an example. The link does not connect automatically and does not carry a server URL. Localhost links only work on the same computer with both terminals running. The same query format preserves `/project-horizon/` routing for a future Pages client build, but no new public client/server deployment was done here.

## Confirm server authority still holds

56. Leave one player's window open and release movement keys.
57. In the **server terminal** (the first terminal), press Ctrl+C.
58. Wait until the browser reports disconnection/stopped snapshots.
59. Hold movement keys. Position and server tick must stay frozen; there is no local physics fallback.
60. In the first terminal, type `npm run server` and press Enter again.
61. The browser reconnects, but all in-memory rooms were lost when the server stopped. It should return home with a room-unavailable message.
62. Click **Create room**, or join another valid room. Flight should work again.

A brief disconnect automatically rejoins the same room if another player kept it alive. That player gets a new socket ID and a safe spawn. If the last player disconnected, or the server restarted, the old room is deleted: intentionally create/join again. There are no persistent sessions or death/respawn systems.

Optional protocol check: open browser Developer Tools → Network, find Socket.io's WebSocket request, and inspect Messages. Outgoing `input` contains keys/aim. Incoming `snapshot` contains the room's identities, tick, positions and velocities. The server ignores claimed position, speed, ID, or room fields in an input.

When finished, stop both terminals with Ctrl+C. Report any unexpected behavior, especially whether remote ships feel smooth with and without fake lag. This manual result is required before calling the milestone accepted or considering Step 4.

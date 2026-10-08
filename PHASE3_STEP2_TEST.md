# P3S2 — solar system

Stage A: world is 12,000 × 12,000 units. Accepted normal/boost speeds remain 290/440 units/s, exponential response 7/s (95% in 0.43s). Full axial crossing takes 41.4/27.3 seconds; diagonal 58.5/38.6 seconds. The 1100 × 600 viewport spans roughly 9.2% × 5% of the world at zoom 1. No visibility advantage is added. These distances support exploration within the future 6–7 minute target without implementing its timers.

Temporary human/bot spawns retain the accepted (1370,1200) cluster with 200-unit separation. Alien respawn retains random safe world-edge positions. The existing static black hole remains (1200,450), event radius 90/influence 500. No storm or launch changes. Bots already acquire nearest eligible roster humans across the entire world and boost beyond 650 units; no AI rebalance is necessary.

Shared WORLD drives server/prediction clamping, projectile boundary checks, camera bounds and minimap scale. All celestial geography remains visual-only until P3S3.

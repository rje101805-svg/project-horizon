# P3S2.7 owner visual checkpoint

Full regression is intentionally deferred until visual approval. These are development captures, not deployment or real-GPU FPS evidence.

## Before / after

| Composition | P3S2.6 baseline | P3S2.7 Standard |
| --- | --- | --- |
| Ordinary gameplay | [Before](baseline-normal.png) | [After](canvas-normal.png) |
| Nebula inspection | [Before](baseline-nebula.png) | [After](canvas-purple.png) |

## Eight required review views

1. [Mostly black space and white pinpoints](canvas-black-space.png)
2. [Localized dense stellar cluster](canvas-cluster.png)
3. [Small purple nebula](canvas-purple.png)
4. [Small cyan nebula](canvas-cyan.png)
5. [Detailed distant golden spiral](canvas-spiral.png)
6. [Directional spherical decorative bodies](canvas-distant-spheres.png)
7. [Normal gameplay composition](canvas-normal.png)
8. [Eight-participant FILL GAME combat with real bot projectiles](canvas-fill-combat.png)

## Standard / Low and WebGL

- [Canvas Standard purple](canvas-purple.png) / [Canvas Low purple](canvas-low-purple.png)
- [Canvas Standard dark corridor](canvas-black-space.png) / [Canvas Low dark corridor](canvas-low-black-space.png)
- [WebGL Standard normal](webgl-normal.png) / [WebGL Standard purple](webgl-purple.png) / [WebGL Low purple](webgl-low-purple.png)
- [WebGL FILL GAME combat](webgl-fill-combat.png)
- [Canvas metrics](canvas-metrics.json) / [WebGL metrics](webgl-metrics.json)

Canvas uses cached point draws instead of visible TileSprites, so both starLayers visible flags are false in its metrics; star primitive counts demonstrate the active point field. WebGL uses exactly one of stars/stars-low at a time. Both captures loaded all eight 1536 × 1024 source textures, reported no page or HTTP errors, and recorded no remaining cosmic/space textures after deferred scene shutdown. Recreation restored the same texture inventory. The unchanged Horizon lens initialized in WebGL; Canvas correctly has no lens shader. SwiftShader is a software path and cannot establish Windows GPU FPS.

## Dark-space composition proxy

Percent of screenshot pixels with max(R,G,B) < 24. These game-canvas screenshots include foreground decoration, ships and HUD; this is not a semantic background-only measurement.

| View | Dark pixels |
| --- | ---: |
| canvas-black-space | 89.83% |
| canvas-cluster | 85.02% |
| canvas-cyan | 81.22% |
| canvas-distant-spheres | 85.00% |
| canvas-fill-combat | 77.50% |
| canvas-low-black-space | 90.31% |
| canvas-low-purple | 85.41% |
| canvas-normal | 83.55% |
| canvas-purple | 85.04% |
| canvas-spiral | 85.58% |

The estimates for full visible nebula silhouettes are 6.55–8.71% of the 1100 × 600 reference viewport; galaxy silhouettes are 1.46–2.62%. See [the verification and Windows guide](../../../PHASE3_STEP2_7_TEST.md) for definitions, implementation limits and pending checks.

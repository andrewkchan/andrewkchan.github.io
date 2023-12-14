import { makeFireSimulation, makeVorticitySimulation, makeSmokeSimulation, makeVelocityFieldSimulation, makeVectorFieldGridDiagram } from "./demos";

makeVectorFieldGridDiagram(document.getElementById("demo-grid"));
makeVelocityFieldSimulation(document.getElementById("velocity-canvas"));
makeVorticitySimulation(document.getElementById("vorticity-canvas"));
makeSmokeSimulation(document.getElementById("smoke-canvas"));
makeFireSimulation(document.getElementById("fire-canvas"));
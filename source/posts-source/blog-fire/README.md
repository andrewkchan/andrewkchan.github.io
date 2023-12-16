# Code: Simulating Fluids, Fire, and Smoke
This is the source code for my blog post [Simulating Fluids, Fire, and Smoke](https://andrewkchan.dev/posts/fire.html).

<img src="https://raw.githubusercontent.com/andrewkchan/andrewkchan.github.io/main/source/posts-source/blog-fire/fire_preview.gif">

- 2D Fluid simulation (uniform grid, simulating incompressible fluid with semi-lagrangian advection)
- Thermal model for fire (buoyancy + cooling)
- Simulation steps are done in parallel on the GPU via WebGL fragment shaders

## Instructions
- `npm install` then `npm run dev` in this directory
- Go to `localhost:8000/fire.html`. Note that blog content will not display correctly because KaTeX doesn't work well with my blog DSL.

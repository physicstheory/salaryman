ADD YOUR OWN FILES (no upload, no GitHub, no git)
=================================================

Copy files into these folders, then start the game as usual (double-click
"Play Salary Man.bat"). The game picks them up every time it starts.

cars\     Car models, as .glb files. The name decides which car it replaces:
            sedan.glb   the saloon, taxis, Ryde cars and police cars
            sports.glb  the sports car (put the Lamborghini Revuelto here)
            kei.glb     the kei car
            keivan.glb  the kei truck / van
            bike.glb    the motorbike
          A model that does not fit nicely (wrong size or facing) can be sent
          to Claude to be adjusted: see "Sending files to Claude" below.

road\     Road surface textures (2048 px or larger is fine, 4K works):
            asphalt_diff.jpg   the colour
            asphalt_nor.jpg    the normal map (OpenGL / "nor_gl" style)
            asphalt_arm.jpg    ambient occlusion / roughness / metal: the GREEN
                               channel is used as roughness
          Poly Haven's asphalt_02 works: rename asphalt_02_diff_4k.jpg to
          asphalt_diff.jpg, asphalt_02_nor_gl_4k.jpg to asphalt_nor.jpg and
          asphalt_02_arm_4k.jpg to asphalt_arm.jpg. (A .png normal map must be
          converted to .jpg, or renamed .jpg after saving it as a JPEG.)

seiko.glb (in this folder, not in a subfolder) replaces the character model.

Sending files to Claude
-----------------------
Files over 25 MB do not upload through the GitHub website. To make a .glb
smaller first, run this in a command prompt in the folder that holds it:
    npx @gltf-transform/cli optimize big.glb small.glb --texture-compress webp
Then upload small.glb at
    https://github.com/physicstheory/salaryman/upload/claude/friendly-cannon-alnk4v/Game/Add%20Your%20Files/cars
and WAIT until the file name shows in the list before pressing "Commit changes".

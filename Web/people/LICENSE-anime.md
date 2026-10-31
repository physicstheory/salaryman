# The people

Every person in the game, Seiko included, is built from pixiv's VRoid sample characters (VRoid Studio beta samples:
Sakurada Fumiriya, HairSample_Male, HairSample_Female, Sendagaya Shibu, Sendagaya Shino, Darkness Shibu, Vivi), which
pixiv published under **CC0** (the licence is in each model's VRM metadata). `Tools/anime/build_anime_people.py`
converts them: the skeleton renamed to the Biped names the game uses, the textures cut down, clothes and hair recoloured,
and heads moved between bodies (Seiko's face and hair on the shirt-and-waistcoat body is how he gets his suits).

Source files: https://github.com/madjin/vrm-samples (vroid/beta).

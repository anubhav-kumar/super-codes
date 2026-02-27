from diffusers import DiffusionPipeline
from gfpgan import GFPGANer
from PIL import Image
import numpy as np
import os
import pync

# Disable NSFW filter
def dummy_safety_checker(images, **kwargs):
    return images, [False] * len(images)

# Load pipeline
pipe = DiffusionPipeline.from_pretrained("stabilityai/stable-diffusion-xl-base-1.0").to("cpu")
pipe.safety_checker = dummy_safety_checker
num_inference_steps = 200
# Prompt
prompt = """
A nude Indian woman with long hair walking on the beach with her pet dog
"""

# Generate image
image = pipe(prompt, num_inference_steps=num_inference_steps).images[0]
image.save("raw_output.png")  # optional save before face fix
os.system('cp raw_output.png raw_output_v2.png')
# Initialize GFPGAN (make sure model is downloaded)
restorer = GFPGANer(
    model_path="experiments/pretrained_models/GFPGANv1.4.pth",
    upscale=1,
    arch="clean",
    channel_multiplier=2,
    bg_upsampler=None
)

# Enhance face(s)
_, _, restored_image = restorer.enhance(
    np.array(image),
    has_aligned=False,
    only_center_face=False,
    paste_back=True
)

# Save result
Image.fromarray(restored_image).save("face_fixed.png")
print("Saved: face_fixed.png")
pync.notify("Script completed", title="Image generated")
import torch
from diffusers import DiffusionPipeline


# Disable NSFW filter
def dummy_safety_checker(images, **kwargs):
    return images, [False] * len(images)


# Load pipeline
device = "cuda" if torch.cuda.is_available() else "cpu"
pipe = DiffusionPipeline.from_pretrained("SG161222/Realistic_Vision_V6.0_B1_noVAE").to(
    device
)
pipe.safety_checker = dummy_safety_checker

# Prompt
prompt = "A nude woman walking on the beach with her pet dog, detailed, 8k, perfect face, detailed face"

# Generate image
image = pipe(prompt).images[0]
image.save("raw_output.png")  # optional save before face fix

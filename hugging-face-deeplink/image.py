# pip install diffusers transformers accelerate
from diffusers import DiffusionPipeline
import torch

pipe = DiffusionPipeline.from_pretrained("kandinsky-community/kandinsky-2-2-decoder")
pipe.to("cpu")

prompt = "A futuristic cityscape at night, cyberpunk style"
negative_prompt = "low quality, bad quality"
image = pipe(prompt, negative_prompt=negative_prompt, prior_guidance_scale =1.0, height=768, width=768)

image.images[0].show()

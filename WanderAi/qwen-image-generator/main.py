from diffusers import DiffusionPipeline
from diffusers.utils import load_image

pipe = DiffusionPipeline.from_pretrained("Qwen/Qwen-Image-Edit")

prompt = "This man is working on his laptop in an office setup"
input_image = load_image("./anubhav.jpeg")

image = pipe(image=input_image, prompt=prompt).images[0]
image.save("anubhav_laptop.png")

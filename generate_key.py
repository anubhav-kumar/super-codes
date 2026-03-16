# generate_key.py
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

key = AESGCM.generate_key(bit_length=256)

with open("video.key", "wb") as f:
    f.write(key)

print("✅ Key saved to video.key — keep this file safe!")
# encrypt.py
import os
import sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def encrypt_video(video_path, key_path="video.key"):
    # Read the key
    with open(key_path, "rb") as f:
        key = f.read()

    # Read the video
    with open(video_path, "rb") as f:
        plaintext = f.read()

    # Encrypt
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)                        # 96-bit random nonce
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    # Save as .enc (nonce is prepended to the file)
    output_path = video_path + ".enc"
    with open(output_path, "wb") as f:
        f.write(nonce + ciphertext)

    print(f"✅ Encrypted: {output_path}")

if __name__ == "__main__":
    video_path = sys.argv[1] if len(sys.argv) > 1 else input("Enter video file path: ")
    encrypt_video(video_path)
# encrypt.py
import os
import sys
import boto3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

BUCKET_NAME = "anubhav-encrypted-files"
S3_FOLDER = "encrypted-files"

def upload_to_s3(local_path):
    s3 = boto3.client("s3")
    s3_key = f"{S3_FOLDER}/{os.path.basename(local_path)}"
    s3.upload_file(local_path, BUCKET_NAME, s3_key)
    print(f"Uploaded: s3://{BUCKET_NAME}/{s3_key}")

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

    print(f"Encrypted: {output_path}")

    # Upload encrypted file to S3
    upload_to_s3(output_path)

    # Delete both local files
    os.remove(output_path)
    print(f"Deleted local: {output_path}")
    os.remove(video_path)
    print(f"Deleted local: {video_path}")

if __name__ == "__main__":
    video_path = sys.argv[1] if len(sys.argv) > 1 else input("Enter video file path: ")
    encrypt_video(video_path)
import logging

# Lambda pre-installs a root handler; local runs need one.
if not logging.getLogger().handlers:
    logging.basicConfig(format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger().setLevel(logging.INFO)

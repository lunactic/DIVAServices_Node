How to build the Docker image for testing DIVAServices
======================================================

First review the `Dockerfile` and remove the proxy section if you do not need proxy support.
If you require proxy support, change the `etc_apt_apt.conf` and the `etc_environment` files
to what works for your network.

Then, you should be able to build the image.

If you do not require proxy support, then run:
~~~
docker build -t divaservices:latest .
~~~


If you require proxy support, then run with your actual parameters:
~~~
docker build \
  --build-arg http_proxy=http://10.1.30.18:3128 \
  --build-arg https_proxy=http://10.1.30.18:3128 \
  -t divaservices:latest .
~~~



TODO add a Docker compose file to have persistent separate storage volume for /data/json
TODO integrate DIVAServices-{manager,spotlight} into this Docker compose file

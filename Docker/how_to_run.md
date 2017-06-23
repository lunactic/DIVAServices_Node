How to start the Docker image for testing DIVAServices
======================================================

To run application, launch the container with the appropriate commmand:
~~~
docker run -it --rm --name divaservices-app --network "host" divaservices
~~~

FIXME --network "host" should be changed to something which specifies the DNS servers if needed

NOTE: the machine running the Docker containers for the methods/algorithms should be accessible from the container of the frontend.
TODO provide its IP using some environment variable (or any smarter way)

TODO also read the rootUrl from an environment variable


Alternatively, to be able to inspect the container, you can run a shell 
within the container to launch commands manually (notice the `bash`).
~~~
docker run -it --rm --name divaservices-app --network "host" divaservices bash
~~~


TODO use another persistent container with a storage volume attached to keep `/data/json` and use --volumes-from in the run command for divaservices-app

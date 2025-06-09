#!/bin/bash
docker build -t postgres -f postgres.dockerfile .
docker run --net=host -it --rm -p 5432:5432 -v $(pwd)/postgresql:/var/run/postgresql postgres:latest

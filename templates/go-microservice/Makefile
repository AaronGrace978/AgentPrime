.PHONY: build run test clean docker

APP_NAME := {{projectName}}
BUILD_DIR := ./bin

build:
	go build -o $(BUILD_DIR)/$(APP_NAME) ./cmd/server

run:
	go run ./cmd/server

test:
	go test -v ./...

clean:
	rm -rf $(BUILD_DIR)

docker:
	docker build -t $(APP_NAME) .

docker-run:
	docker run -p 8080:8080 $(APP_NAME)

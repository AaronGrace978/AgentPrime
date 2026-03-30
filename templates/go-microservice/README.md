# {{projectName}}

{{description}}

A lightweight Go microservice with REST API.

## Getting Started

```bash
# Run directly
go run ./cmd/server

# Or build and run
make build
./bin/{{packageName}}
```

Server starts at http://localhost:8080

## API Endpoints

- `GET /health` - Health check
- `GET /api/items` - List all items
- `GET /api/items/{id}` - Get item by ID
- `POST /api/items` - Create new item

## Docker

```bash
# Build image
make docker

# Run container
make docker-run
```

## Author

{{author}}

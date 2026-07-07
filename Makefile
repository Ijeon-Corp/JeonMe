.PHONY: up down logs api-shell web-shell migrate-up migrate-down

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

api-shell:
	docker compose exec api sh

web-shell:
	docker compose exec web sh

migrate-up:
	$(MAKE) -C apps/api migrate-up

migrate-down:
	$(MAKE) -C apps/api migrate-down

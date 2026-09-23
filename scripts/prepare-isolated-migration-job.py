from pathlib import Path

workflow = Path('.github/workflows/run-production-db-migrations.yml')
text = workflow.read_text()

permissions_old = "permissions:\n  contents: read\n  id-token: write\n"
permissions_new = "permissions:\n  contents: read\n  packages: read\n  id-token: write\n"
if permissions_new not in text:
    if permissions_old not in text:
        raise SystemExit('migration permissions anchor not found')
    text = text.replace(permissions_old, permissions_new, 1)

prior_target = "          - 20260920_03_backfill_legacy_app_user_memberships\n"
new_target = prior_target + "          - 20260922_01_create_rentee_property_assignments\n"
if new_target not in text:
    if prior_target not in text:
        raise SystemExit('migration through target anchor not found')
    text = text.replace(prior_target, new_target, 1)

refusal = "      - name: Refuse apply without direct privileged migration access\n"
wait = "      - name: Wait for this commit to be the serving Container App revision\n"
if refusal in text:
    start = text.index(refusal)
    end = text.index(wait, start)
    text = text[:start] + text[end:]

old_wait = "      - name: Wait for this commit to be the serving Container App revision\n        if: steps.db_probe.outputs.status == 'container' && env.MIGRATION_MODE == 'plan'\n"
new_wait = "      - name: Wait for this commit to be the serving Container App revision\n        if: steps.db_probe.outputs.status == 'container'\n"
if old_wait in text:
    text = text.replace(old_wait, new_wait, 1)
elif new_wait not in text:
    raise SystemExit('migration wait condition anchor not found')
text = text.replace('within the migration-plan wait window.', 'within the migration wait window.')

apply_anchor = "      - name: Run read-only migration plan inside the Container App\n"
apply_block = r'''      - name: Apply migration in isolated Container Apps Job
        if: steps.db_probe.outputs.status == 'container' && env.MIGRATION_MODE == 'apply'
        shell: bash
        env:
          MSSQL_MIGRATION_USER: ${{ secrets.MSSQL_MIGRATION_USER }}
          MSSQL_MIGRATION_PASSWORD: ${{ secrets.MSSQL_MIGRATION_PASSWORD }}
          GHCR_USERNAME: ${{ github.actor }}
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          az extension add --name containerapp --upgrade --yes >/dev/null

          job_name="khrental-db-migrate"
          environment_id=$(az containerapp show \
            --name "$AZURE_CONTAINER_APP_NAME" \
            --resource-group "$AZURE_RESOURCE_GROUP" \
            --query properties.environmentId \
            -o tsv)
          image=$(az containerapp show \
            --name "$AZURE_CONTAINER_APP_NAME" \
            --resource-group "$AZURE_RESOURCE_GROUP" \
            --query "properties.template.containers[0].image" \
            -o tsv)

          if [ -z "$environment_id" ] || [ "$environment_id" = "None" ]; then
            echo "Unable to resolve the production Container Apps environment." >&2
            exit 1
          fi
          if [ -z "$image" ] || [ "$image" = "None" ]; then
            echo "Unable to resolve the serving production image." >&2
            exit 1
          fi
          if ! echo "$image" | grep -Fq ":${GITHUB_SHA}"; then
            echo "Refusing migration: serving image does not match workflow SHA. image=$image sha=${GITHUB_SHA}" >&2
            exit 1
          fi

          az containerapp job delete \
            --name "$job_name" \
            --resource-group "$AZURE_RESOURCE_GROUP" \
            --yes --output none 2>/dev/null || true

          cleanup() {
            az containerapp job delete \
              --name "$job_name" \
              --resource-group "$AZURE_RESOURCE_GROUP" \
              --yes --output none 2>/dev/null || true
          }
          trap cleanup EXIT

          secret_args=()
          env_args=(
            "MSSQL_SERVER=$MSSQL_SERVER"
            "MSSQL_DATABASE=$MSSQL_DATABASE"
          )

          if [ -n "${MSSQL_MIGRATION_USER:-}" ] || [ -n "${MSSQL_MIGRATION_PASSWORD:-}" ]; then
            if [ -z "${MSSQL_MIGRATION_USER:-}" ] || [ -z "${MSSQL_MIGRATION_PASSWORD:-}" ]; then
              echo "Both MSSQL_MIGRATION_USER and MSSQL_MIGRATION_PASSWORD are required when SQL migration credentials are configured." >&2
              exit 1
            fi
            echo "::add-mask::$MSSQL_MIGRATION_USER"
            echo "::add-mask::$MSSQL_MIGRATION_PASSWORD"
            secret_args+=(
              "mssql-migration-user=$MSSQL_MIGRATION_USER"
              "mssql-migration-password=$MSSQL_MIGRATION_PASSWORD"
            )
            env_args+=(
              "MSSQL_MIGRATION_USER=secretref:mssql-migration-user"
              "MSSQL_MIGRATION_PASSWORD=secretref:mssql-migration-password"
            )
          else
            if [ -z "${MSSQL_ACCESS_TOKEN:-}" ]; then
              echo "No privileged migration authentication is available." >&2
              exit 1
            fi
            secret_args+=("mssql-access-token=$MSSQL_ACCESS_TOKEN")
            env_args+=("MSSQL_ACCESS_TOKEN=secretref:mssql-access-token")
          fi

          echo "Using an isolated in-network migration job; no firewall rule or web-runtime DDL elevation is required."

          az containerapp job create \
            --name "$job_name" \
            --resource-group "$AZURE_RESOURCE_GROUP" \
            --environment "$environment_id" \
            --trigger-type Manual \
            --replica-timeout 900 \
            --replica-retry-limit 0 \
            --replica-completion-count 1 \
            --parallelism 1 \
            --image "$image" \
            --cpu 0.5 \
            --memory 1.0Gi \
            --command "/bin/sh" \
            --args "-c" "node scripts/run-production-migrations.mjs --mode=apply --through=${MIGRATION_THROUGH}" \
            --registry-server ghcr.io \
            --registry-username "$GHCR_USERNAME" \
            --registry-password "$GHCR_TOKEN" \
            --secrets "${secret_args[@]}" \
            --env-vars "${env_args[@]}" \
            --output none

          execution_name=$(az containerapp job start \
            --name "$job_name" \
            --resource-group "$AZURE_RESOURCE_GROUP" \
            --query name -o tsv)

          if [ -z "$execution_name" ]; then
            echo "Container Apps migration job did not return an execution name." >&2
            exit 1
          fi

          final_status=""
          for attempt in $(seq 1 120); do
            status=$(az containerapp job execution show \
              --name "$job_name" \
              --resource-group "$AZURE_RESOURCE_GROUP" \
              --job-execution-name "$execution_name" \
              --query properties.status -o tsv 2>/dev/null || true)
            case "${status,,}" in
              succeeded) final_status="succeeded"; break ;;
              failed)
                echo "Container Apps migration execution failed: $execution_name" >&2
                exit 1
                ;;
            esac
            echo "Waiting for migration execution $execution_name (status=${status:-pending}, attempt $attempt/120)..."
            sleep 5
          done

          if [ "$final_status" != "succeeded" ]; then
            echo "Migration execution did not complete successfully within the wait window." >&2
            exit 1
          fi

          ready_revision=$(az containerapp show \
            --name "$AZURE_CONTAINER_APP_NAME" \
            --resource-group "$AZURE_RESOURCE_GROUP" \
            --query properties.latestReadyRevisionName \
            -o tsv)

          echo "Migration job succeeded. Verifying the applied ledger/schema read-only from ready revision: $ready_revision"
          exec_command="az containerapp exec --name '$AZURE_CONTAINER_APP_NAME' --resource-group '$AZURE_RESOURCE_GROUP' --revision '$ready_revision' --command \"/bin/sh -c 'MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true node scripts/run-production-migrations.mjs --mode=plan --through=${MIGRATION_THROUGH}'\""
          script -q -e -c "$exec_command" /dev/null | tee migration-output.txt

          {
            echo '### Production database migration result'
            echo
            echo 'Applied through an isolated Container Apps Job because the GitHub-hosted runner could not reach production SQL directly.'
            echo 'The web runtime identity remained read-only for migration planning.'
            echo
            echo '```text'
            cat migration-output.txt
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"

'''
if 'Apply migration in isolated Container Apps Job' not in text:
    if apply_anchor not in text:
        raise SystemExit('read-only plan step anchor not found')
    text = text.replace(apply_anchor, apply_block + apply_anchor, 1)

workflow.write_text(text)

tests = Path('tests/membership-access-model.test.js')
source = tests.read_text()
old_assertions = """  assert.match(migrationWorkflowSource, /No firewall rule will be opened/);\n  assert.match(migrationWorkflowSource, /dedicated privileged migration executor inside the production network/);\n"""
new_assertions = """  assert.match(migrationWorkflowSource, /Apply migration in isolated Container Apps Job/);\n  assert.match(migrationWorkflowSource, /az containerapp job create/);\n  assert.match(migrationWorkflowSource, /az containerapp job start/);\n  assert.match(migrationWorkflowSource, /az containerapp job execution show/);\n  assert.match(migrationWorkflowSource, /az containerapp job delete/);\n  assert.match(migrationWorkflowSource, /MSSQL_ACCESS_TOKEN=secretref:mssql-access-token/);\n  assert.match(migrationWorkflowSource, /no firewall rule or web-runtime DDL elevation is required/);\n  assert.match(migrationWorkflowSource, /20260922_01_create_rentee_property_assignments/);\n"""
if new_assertions not in source:
    if old_assertions not in source:
        raise SystemExit('migration workflow regression assertion anchor not found')
    source = source.replace(old_assertions, new_assertions, 1)
tests.write_text(source)

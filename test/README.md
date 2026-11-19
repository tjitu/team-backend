Tryout deletion regression checks use Node's built-in test runner and the compiled backend:

```powershell
npm run build
npm run test:tryout-deletion
```

API validation, authentication, and authorization checks always run. To include the PostgreSQL foreign-key and rollback checks, create an empty disposable local database named `tryout_deletion_test` and set its connection URL first:

```powershell
$env:TRYOUT_DELETION_TEST_DATABASE_URL = 'postgresql://test_user@127.0.0.1:5432/tryout_deletion_test?schema=public'
npm run test:tryout-deletion
```

The database checks only accept localhost and that exact database name. They create their own fixture tables, refuse existing tables, and remove the fixture tables afterward. Do not use an application database. Without the environment variable, the PostgreSQL suite is skipped.

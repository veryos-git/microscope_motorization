# migration
this existing web application project has to be migrated to the new webapplication structure that is in the folder 'webapp_template' 

important things related to the migration are written down in migration.md

## Important 
keep all functionality of the current application. only migrate it to adhere to the same coding style of the 'webapp_template' project. 
'if a file has to be deleted , dont delete it in this first step of the migration. create a folder named './old_files_before_migration' and move the files that have to be deleted there. 


## vue js 
vue js is used in the new codebase 
## database
instead of a json file a whole sql database is used

### no http (if not absolutely required)
do not use http request but instead use websocket requests that can receive a response with the 'f_send_wsmsg_with_response' function. for stuff like img src attributes it is unfortunately only possible to use old 'http' requests like "src" : '/api/file?path=path/to/file.png'

### vuejs global state
state should not be complicated and therefore there is one global state , all data that has to be shared between components (and that is almost all data) is definde in index.js reactive o_state variable. in the vue components use the global 'o_state' from index.js

### more minor changes
#### default db data
the default data is defined as a nested javascript object and there is a function 'f_ensure_default_data' to ensure its existance.




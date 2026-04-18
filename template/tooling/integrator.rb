require 'fileutils'
require 'json'
require 'pp'

def install_connections(integrator_sdk, integrator_path)
  connections = JSON.parse(File.read(File.join(integrator_path, "connections.json")))
  connections.each do |connection|
    operations = connection.delete("operations")

    connection_response = integrator_sdk.add_connection(connection)
    if connection_response.status == 200
      connection_id = connection_response.content["id"]
      operations.each do |operation|
        operation_response = integrator_sdk.add_operation(connection_id, operation)
        if operation_response.status != 200
          raise "(#{operation_response.code}) Failed to create the \"#{operation["name"]}\" operation for the \"#{connection["name"]}\" connection: #{operation_response.inspect}"
        end
      end
    else
      raise "(#{connection_response.code}) Failed to create the \"#{connection["name"]}\" connection: : #{connection_response.inspect}"
    end
  end
end

def export_connections(integrator_sdk, integrator_path)
  connections = []
  connections_response = integrator_sdk.find_connections()
  if connections_response.status == 200
    connections_response.content.each do |connection|
      operations_response = integrator_sdk.find_operations(connection["id"])
      if operations_response.status == 200
        operations = operations_response.content.map do |operation|
          sanitize_exported_operation(operation)
        end
        connection = sanitize_exported_connection(connection)
        connections = merge_operations(connections, connection, operations)
      else
        raise "(#{res.code}) Error retrieving operations: #{operations_response.inspect}"
      end
    end
    FileUtils.mkdir_p(File.dirname(integrator_path))
    File.write(File.join(integrator_path, "connections.json"), JSON.pretty_generate(connections))
  else
    raise "(#{connections_response.code}) Error retrieving connections: #{connections_response.inspect}"
  end
end

def merge_operations(connections, connection, operations)
  connection["operations"] = operations
  connections << connection
  connections
end

def sanitize_exported_connection(connection)
  connection = delete_metadata(connection)
  config_type = connection["config"]["configType"]
  if (config_type == "http")
    connection = sanitize_http_connection(connection)
  end
  connection
end

def sanitize_exported_operation(operation)
  operation = delete_metadata(operation)
  operation["notes"] = "" if operation["notes"].nil?
  operation
end

def sanitize_http_connection(connection)
  connection["config"]["baseUrl"] = "https://update.me"

  auth_type = connection["config"]["auth"] && connection["config"]["auth"]["authType"]
  if (auth_type == "basic")
    connection = sanitize_http_basic(connection)
  end

  connection
end

def sanitize_http_basic(connection)
  connection["config"]["auth"]["username"] = "changeit"
  connection["config"]["auth"]["password"] = "changeit"
  connection
end

def delete_metadata(item)
  item.delete("insertedAt")
  item.delete("updatedAt")
  item.delete("lockVersion")
  # connection
  item.delete("status")
  item
end

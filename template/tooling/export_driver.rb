# A driver that will convert the configuration information into a format that the export process expects.
#
# The export driver utilizes environment variables to provide the necessary configuration information
# to the export process. Below are the environment variables and what they are used for.
#
# Required Environment Variables
# -------------------------------
# EXPORT_DOMAIN                 - The name of the domain hosting the space to be exported
# EXPORT_SPACE_SLUG             - The slug of the space to be exported
# EXPORT_SPACE_ADMIN_USERNAME   - The username of a space admin user account in the space to be exported
# EXPORT_SPACE_ADMIN_PASSWORD   - The password for the corresponding space admin user account
#
# Optional Environment Variables
# -------------------------------
# EXPORT_OAUTH_CLIENT_ID        - The OAuth Client Id if different than the space admin username
# EXPORT_OAUTH_CLIENT_SECRET    - The OAuth Client Secret for the corresponding OAuth Client Id
#
require 'json'

env_errors = []
env_errors << "Set the EXPORT_DOMAIN environment variable to export from" if ENV["EXPORT_DOMAIN"].nil?
env_errors << "Set the EXPORT_SPACE_SLUG environment variable to export from" if ENV["EXPORT_SPACE_SLUG"].nil?
env_errors << "Set the EXPORT_SPACE_ADMIN_USERNAME environment variable for the space to export from" if ENV["EXPORT_SPACE_ADMIN_USERNAME"].nil?
env_errors << "Set the EXPORT_SPACE_ADMIN_PASSWORD environment variable for the space to export from" if ENV["EXPORT_SPACE_ADMIN_PASSWORD"].nil?

unless env_errors.empty?
  raise "Missing environment variables: \n\t#{env_errors.join("\n\t")}"
end

domain = ENV["EXPORT_DOMAIN"]
space_slug = ENV["EXPORT_SPACE_SLUG"]
space_username = ENV["EXPORT_SPACE_ADMIN_USERNAME"]
space_password = ENV["EXPORT_SPACE_ADMIN_PASSWORD"].gsub("$", "\$").gsub("`", "\`").gsub("\"", "\\\"").gsub("\\", "\\\\").gsub("!", "\!").gsub("~", "\~")
oauth_client_id = ENV["EXPORT_OAUTH_CLIENT_ID"] || space_username
oauth_client_secret = ENV["EXPORT_OAUTH_CLIENT_SECRET"] || space_password

export_server = "https://#{space_slug}.#{domain}"

export_options = {
  "core" => {
    "api" => "#{export_server}/app/api/v1",
    "agent_api" => "#{export_server}/app/components/agents/system/app/api/v1",
    "proxy_url" => "#{export_server}/app/components",
    "server" => export_server,
    "space_slug" => space_slug,
    "space_name" => "Momentum",
    "service_user_username" => space_username,
    "service_user_password" => space_password,
    "task_api_v1" => "#{export_server}/app/components/task/app/api/v1",
    "task_api_v2" => "#{export_server}/app/components/task/app/api/v2"
  },
  "http_options" => {
    "log_level" => "info",
    "log_output" => "stdout",
    "oauth_client_id" => oauth_client_id,
    "oauth_client_secret" => oauth_client_secret
  }
}

export_file = File.join(File.dirname(__FILE__), "export.rb")
system("ruby", export_file, export_options.to_json)

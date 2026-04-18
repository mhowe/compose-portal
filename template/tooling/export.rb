# Action options must be passed as a JSON string
#
# Format with example values:
#
# {
#   "core" => {
#     "api" => "https://foo.web-server/app/api/v1",
#     "agent_api" => "https://foo.web-server/app/components/agent/app/api/v1",
#     "proxy_url" => "https://foo.web-server/app/components",
#     "server" => "https://foo.web-server",
#     "space_slug" => "foo",
#     "space_name" => "Foo",
#     "service_user_username" => "service_user_username",
#     "service_user_password" => "secret",
#     "task_api_v1" => "https://foo.web-server/app/components/task/app/api/v1",
#     "task_api_v2" => "https://foo.web-server/app/components/task/app/api/v2"
#   },
#   "http_options" => {
#     "oauth_client_id" => "my-ouath-id",
#     "oauth_client_secret" => "my-oauth-secret",
#     "log_level" => "info",
#     "log_output" => "stderr"
#   }
# }

require 'logger'
require 'json'

template_name = "momentum-portal"

logger = Logger.new(STDERR)
logger.level = Logger::INFO
logger.formatter = proc do |severity, datetime, progname, msg|
  date_format = datetime.utc.strftime("%Y-%m-%dT%H:%M:%S.%LZ")
  "[#{date_format}] #{severity}: #{msg}\n"
end

raise "Missing JSON argument string passed to template export script" if ARGV.empty?
begin
  puts ARGV.inspect
  vars = JSON.parse(ARGV[0])
rescue => e
  raise "Template #{template_name} export error: #{e.inspect}"
end


# determine the directory paths
tooling_path = File.dirname(File.expand_path(__FILE__))
export_path = File.expand_path(File.join(tooling_path, "..", "export"))
core_path = File.join(export_path, "core")
integrator_path = File.join(export_path, "integrator")
task_path = File.join(export_path, "task")


# ------------------------------------------------------------------------------
# setup
# ------------------------------------------------------------------------------

logger.info "Installing gems for the \"#{template_name}\" template."
Dir.chdir(tooling_path) { system("bundle", "install") }

require 'kinetic_sdk'
require File.join(tooling_path, "integrator.rb")

http_options = (vars["http_options"] || {}).each_with_object({}) do |(k,v),result|
  result[k.to_sym] = v
end


# ------------------------------------------------------------------------------
# artifacts
# ------------------------------------------------------------------------------

logger.info "Setting up the SDK"
space_sdk = KineticSdk::Core.new({
  space_server_url: vars["core"]["server"],
  space_slug: vars["core"]["space_slug"],
  username: vars["core"]["service_user_username"],
  password: vars["core"]["service_user_password"],
  options: http_options.merge({ export_directory: "#{core_path}" })
})
integrator_sdk = KineticSdk::Integrator.new({
  space_server_url: vars["core"]["server"],
  space_slug: vars["core"]["space_slug"],
  username: vars["core"]["service_user_username"],
  password: vars["core"]["service_user_password"],
  options: http_options.merge({
    export_directory: "#{integrator_path}",
    oauth_client_id: vars["http_options"]["oauth_client_id"] || vars["core"]["service_user_username"],
    oauth_client_secret: vars["http_options"]["oauth_client_secret"] || vars["core"]["service_user_password"]
  })
})
task_sdk = KineticSdk::Task.new({
  app_server_url: "#{vars["core"]["proxy_url"]}/task",
  username: vars["core"]["service_user_username"],
  password: vars["core"]["service_user_password"],
  options: http_options.merge({ export_directory: "#{task_path}" })
})

logger.info "Removing files and folders from the existing \"#{template_name}\" template."
FileUtils.rm_rf Dir.glob("#{core_path}/*")
FileUtils.rm_rf Dir.glob("#{integrator_path}/*")
FileUtils.rm_rf Dir.glob("#{task_path}/*")


# fetch export from core service and write to export directory
logger.info "Exporting the core components for the \"#{template_name}\" template."
logger.info "  exporting with api: #{space_sdk.api_url}"
logger.info "   - exporting configuration data (Kapps,forms, etc)"
space_sdk.export_space

# cleanup properties that should not be committed with export
# bridge keys
Dir["#{core_path}/space/bridges/*.json"].each do |filename|
  bridge = JSON.parse(File.read(filename))
  if bridge.has_key?("key")
    bridge.delete("key")
    File.open(filename, 'w') { |file| file.write(JSON.pretty_generate(bridge)) }
  end
end

# cleanup space
filename = "#{core_path}/space.json"
space = JSON.parse(File.read(filename))
# filestore key
if space.has_key?("filestore") && space["filestore"].has_key?("key")
  space["filestore"].delete("key")
end
# platform components
if space.has_key?("platformComponents")
  if space["platformComponents"].has_key?("task")
    space["platformComponents"].delete("task")
  end
  (space["platformComponents"]["agents"] || []).each_with_index do |agent,idx|
    space["platformComponents"]["agents"][idx]["url"] = ""
  end
end
# rewrite the space file
File.open(filename, 'w') { |file| file.write(JSON.pretty_generate(space)) }


# ------------------------------------------------------------------------------
# integrator
# ------------------------------------------------------------------------------
logger.info "Exporting the integrator components for the \"#{template_name}\" template."
logger.info "  exporting with api: #{integrator_sdk.api_url}"
export_connections(integrator_sdk, integrator_path)


# ------------------------------------------------------------------------------
# task
# ------------------------------------------------------------------------------
logger.info "Exporting the task components for the \"#{template_name}\" template."
logger.info "  exporting with api: #{task_sdk.api_url}"

# export all sources, handlers, groups, policy rules, categories, and access keys
task_sdk.export_all_except_trees

# export trees for all sources
(task_sdk.find_sources.content['sourceRoots'] || []).each do |source|
  logger.info "Exporting trees for source: #{source['name']}"
  task_sdk.export_trees(source['name'])
end

# export routines
task_sdk.export_trees("-")


# ------------------------------------------------------------------------------
# complete
# ------------------------------------------------------------------------------

logger.info "Finished exporting the \"#{template_name}\" template."

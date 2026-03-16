defmodule SuperCodes.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      SuperCodesWeb.Telemetry,
      {DNSCluster, query: Application.get_env(:super_codes, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: SuperCodes.PubSub},
      SuperCodes.BettingStore,
      # Start to serve requests, typically the last entry
      SuperCodesWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: SuperCodes.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    SuperCodesWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end

defmodule LiveBettingWeb.WindowLive.Index do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Matches

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Listing Windows
        <:actions>
          <.button variant="primary" navigate={~p"/windows/new"}>
            <.icon name="hero-plus" /> New Window
          </.button>
        </:actions>
      </.header>

      <.table
        id="windows"
        rows={@streams.windows}
        row_click={fn {_id, window} -> JS.navigate(~p"/windows/#{window}") end}
      >
        <:col :let={{_id, window}} label="Sequence number">{window.sequence_number}</:col>
        <:col :let={{_id, window}} label="Opens at">{window.opens_at}</:col>
        <:col :let={{_id, window}} label="Closes at">{window.closes_at}</:col>
        <:col :let={{_id, window}} label="Duration seconds">{window.duration_seconds}</:col>
        <:col :let={{_id, window}} label="Status">{window.status}</:col>
        <:col :let={{_id, window}} label="Resolution type">{window.resolution_type}</:col>
        <:col :let={{_id, window}} label="Winning team">{window.winning_team}</:col>
        <:col :let={{_id, window}} label="House takeout pct">{window.house_takeout_pct}</:col>
        <:action :let={{_id, window}}>
          <div class="sr-only">
            <.link navigate={~p"/windows/#{window}"}>Show</.link>
          </div>
          <.link navigate={~p"/windows/#{window}/edit"}>Edit</.link>
        </:action>
        <:action :let={{id, window}}>
          <.link
            phx-click={JS.push("delete", value: %{id: window.id}) |> hide("##{id}")}
            data-confirm="Are you sure?"
          >
            Delete
          </.link>
        </:action>
      </.table>
    </Layouts.app>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Listing Windows")
     |> stream(:windows, list_windows())}
  end

  @impl true
  def handle_event("delete", %{"id" => id}, socket) do
    window = Matches.get_window!(id)
    {:ok, _} = Matches.delete_window(window)

    {:noreply, stream_delete(socket, :windows, window)}
  end

  defp list_windows() do
    Matches.list_windows()
  end
end
